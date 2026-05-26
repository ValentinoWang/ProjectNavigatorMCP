import path from "node:path";
import { loadProjectConfig } from "../config/projectConfig.js";
import type { ProjectDatabase } from "../db/connection.js";
import { openProject } from "../db/project.js";
import { initProject } from "../cli/commands/init.js";
import { insertSourceDocuments, scanSourceDocuments } from "../docs/sourceDocScanner.js";
import { readRepoTextFile, scanFiles } from "./fileScanner.js";
import { scanCommands } from "./commandScanner.js";
import { getGitSha, scanCoChanges } from "./gitScanner.js";
import { scanRules } from "./ruleScanner.js";
import { scanTextSymbols } from "./symbolScanner.js";
import type { ScanResult, ScannedFile, ScannedImport, ScannedRoute, ScannedSymbol } from "./types.js";

interface FileRow {
  id: number;
  path: string;
}

interface SymbolRow {
  id: number;
  file_id: number;
  name: string;
}

export function scanRepo(repoPath: string): ScanResult {
  initProject(repoPath);
  const project = openProject(repoPath);
  try {
    return scanIntoDatabase(project.db, project.repo.id, project.repoRoot);
  } finally {
    project.db.close();
  }
}

function scanIntoDatabase(db: ProjectDatabase, repoId: number, repoRoot: string): ScanResult {
  const gitSha = getGitSha(repoRoot);
  const scanRun = db
    .prepare("INSERT INTO scan_runs (repo_id, git_sha, status) VALUES (?, ?, 'running')")
    .run(repoId, gitSha);
  const scanRunId = Number(scanRun.lastInsertRowid);

  try {
    const config = loadProjectConfig(repoRoot);
    rebuildFtsTables(db);
    clearScannedData(db, repoId);
    const files = scanFiles(repoRoot, config);
    insertFiles(db, repoId, files);
    const fileRows = loadFileRows(db, repoId);

    const symbols: ScannedSymbol[] = [];
    const imports: ScannedImport[] = [];
    const routes: ScannedRoute[] = [];
    for (const file of files) {
      const content = readRepoTextFile(repoRoot, file.path, config.maxFileBytes);
      if (!content) {
        continue;
      }
      const result = scanTextSymbols(file.path, file.language, content);
      symbols.push(...result.symbols);
      imports.push(...result.imports);
      routes.push(...result.routes);
    }

    insertSymbols(db, fileRows, symbols);
    const symbolRows = loadSymbolRows(db);
    insertContainsEdges(db, repoId, fileRows, symbolRows);
    insertImportEdges(db, repoId, fileRows, imports);
    insertRoutes(db, repoId, fileRows, symbolRows, routes);
    const testCount = insertTestEdges(db, repoId, fileRows);

    const commands = scanCommands(repoRoot);
    insertCommands(db, repoId, commands);

    const rules = scanRules(repoRoot);
    insertRules(db, repoId, rules);

    const documents = scanSourceDocuments(repoRoot, files);
    insertSourceDocuments(db, repoId, fileRows, documents);

    const coChanges = scanCoChanges(repoRoot, new Set(files.map((file) => file.path)));
    insertCoChanges(db, repoId, fileRows, coChanges);

    db.prepare("UPDATE scan_runs SET finished_at = CURRENT_TIMESTAMP, status = 'success' WHERE id = ?").run(scanRunId);
    return {
      repoRoot,
      gitSha,
      files: files.length,
      symbols: symbols.length,
      imports: imports.length,
      routes: routes.length,
      tests: testCount,
      commands: commands.length,
      rules: rules.length,
      documents: documents.length,
      coChanges: coChanges.length
    };
  } catch (error) {
    db.prepare("UPDATE scan_runs SET finished_at = CURRENT_TIMESTAMP, status = 'failed' WHERE id = ?").run(scanRunId);
    throw error;
  }
}

function rebuildFtsTables(db: ProjectDatabase): void {
  for (const table of ["files_fts", "symbols_fts", "memories_fts"]) {
    db.prepare(`INSERT INTO ${table}(${table}) VALUES('rebuild')`).run();
  }
}

function clearScannedData(db: ProjectDatabase, repoId: number): void {
  const fileIds = db
    .prepare("SELECT id FROM files WHERE repo_id = ?")
    .all(repoId)
    .map((row) => (row as { id: number }).id);
  db.prepare("DELETE FROM edges WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM routes WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM tests WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM commands WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM project_rules WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM document_steps WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM document_targets WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM documents WHERE repo_id = ?").run(repoId);
  for (const fileId of fileIds) {
    db.prepare("DELETE FROM symbols WHERE file_id = ?").run(fileId);
  }
  db.prepare("DELETE FROM files WHERE repo_id = ?").run(repoId);
}

function insertFiles(db: ProjectDatabase, repoId: number, files: ScannedFile[]): void {
  const stmt = db.prepare("INSERT INTO files (repo_id, path, language, size, hash) VALUES (?, ?, ?, ?, ?)");
  const insert = db.transaction(() => {
    for (const file of files) {
      stmt.run(repoId, file.path, file.language, file.size, file.hash);
    }
  });
  insert();
}

function loadFileRows(db: ProjectDatabase, repoId: number): Map<string, number> {
  const rows = db.prepare("SELECT id, path FROM files WHERE repo_id = ?").all(repoId) as FileRow[];
  return new Map(rows.map((row) => [row.path, row.id]));
}

function insertSymbols(db: ProjectDatabase, fileRows: Map<string, number>, symbols: ScannedSymbol[]): void {
  const stmt = db.prepare(
    "INSERT INTO symbols (file_id, name, kind, signature, qualified_name, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insert = db.transaction(() => {
    for (const item of symbols) {
      const fileId = fileRows.get(item.filePath);
      if (fileId) {
        stmt.run(fileId, item.name, item.kind, item.signature, item.qualifiedName, item.startLine, item.endLine);
      }
    }
  });
  insert();
}

function loadSymbolRows(db: ProjectDatabase): SymbolRow[] {
  return db.prepare("SELECT id, file_id, name FROM symbols").all() as SymbolRow[];
}

function insertContainsEdges(
  db: ProjectDatabase,
  repoId: number,
  fileRows: Map<string, number>,
  symbols: SymbolRow[]
): void {
  const fileIdSet = new Set(fileRows.values());
  const stmt = db.prepare(
    "INSERT INTO edges (repo_id, from_type, from_id, to_type, to_id, kind, weight, confidence) VALUES (?, 'file', ?, 'symbol', ?, 'contains', 1.0, 1.0)"
  );
  const insert = db.transaction(() => {
    for (const symbol of symbols) {
      if (fileIdSet.has(symbol.file_id)) {
        stmt.run(repoId, symbol.file_id, symbol.id);
      }
    }
  });
  insert();
}

function insertImportEdges(
  db: ProjectDatabase,
  repoId: number,
  fileRows: Map<string, number>,
  imports: ScannedImport[]
): void {
  const stmt = db.prepare(
    "INSERT INTO edges (repo_id, from_type, from_id, to_type, to_id, kind, weight, confidence) VALUES (?, 'file', ?, 'file', ?, 'imports', 0.8, ?)"
  );
  const insert = db.transaction(() => {
    for (const item of imports) {
      const fromId = fileRows.get(item.fromPath);
      const toPath = resolveImportPath(item.fromPath, item.importText, fileRows);
      const toId = toPath ? fileRows.get(toPath) : undefined;
      if (fromId && toId) {
        stmt.run(repoId, fromId, toId, item.importText.startsWith(".") ? 0.9 : 0.45);
      }
    }
  });
  insert();
}

function resolveImportPath(fromPath: string, importText: string, fileRows: Map<string, number>): string | null {
  const candidates: string[] = [];
  if (importText.startsWith(".")) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), importText));
    candidates.push(base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.dart`, `${base}.py`, `${base}/index.ts`);
  } else if (importText.startsWith("package:")) {
    const withoutPackage = importText.replace(/^package:[^/]+\//, "");
    candidates.push(`frontend/lib/${withoutPackage}`);
  } else {
    const dotted = importText.replaceAll(".", "/");
    candidates.push(`${dotted}.py`, `backend/${dotted}.py`, `backend/app/${dotted}.py`);
  }
  return candidates.find((candidate) => fileRows.has(candidate)) ?? null;
}

function insertRoutes(
  db: ProjectDatabase,
  repoId: number,
  fileRows: Map<string, number>,
  symbols: SymbolRow[],
  routes: ScannedRoute[]
): void {
  const symbolsByFileAndName = new Map(symbols.map((row) => [`${row.file_id}:${row.name}`, row.id]));
  const stmt = db.prepare(
    "INSERT INTO routes (repo_id, framework, method, path, name, file_id, symbol_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insert = db.transaction(() => {
    for (const route of routes) {
      const fileId = fileRows.get(route.filePath);
      if (!fileId) {
        continue;
      }
      const symbolId = route.symbolName ? (symbolsByFileAndName.get(`${fileId}:${route.symbolName}`) ?? null) : null;
      stmt.run(repoId, route.framework, route.method, route.path, route.name, fileId, symbolId);
    }
  });
  insert();
}

function insertTestEdges(db: ProjectDatabase, repoId: number, fileRows: Map<string, number>): number {
  const files = Array.from(fileRows.keys());
  const sourceFiles = files.filter((file) => !isTestFile(file));
  const testFiles = files.filter(isTestFile);
  const stmt = db.prepare(
    "INSERT INTO tests (repo_id, test_file_id, target_file_id, command, confidence) VALUES (?, ?, ?, ?, ?)"
  );
  const edgeStmt = db.prepare(
    "INSERT INTO edges (repo_id, from_type, from_id, to_type, to_id, kind, weight, confidence) VALUES (?, 'file', ?, 'file', ?, 'covered_by', 0.9, ?)"
  );
  let count = 0;
  const insert = db.transaction(() => {
    for (const testFile of testFiles) {
      const testId = fileRows.get(testFile);
      if (!testId) {
        continue;
      }
      const target = bestTestTarget(testFile, sourceFiles);
      const targetId = target ? fileRows.get(target.path) : undefined;
      const confidence = target?.confidence ?? 0.4;
      stmt.run(repoId, testId, targetId ?? null, commandForTestFile(testFile), confidence);
      count += 1;
      if (targetId) {
        edgeStmt.run(repoId, targetId, testId, confidence);
      }
    }
  });
  insert();
  return count;
}

function isTestFile(file: string): boolean {
  return /(^|\/)(test|tests)\//.test(file) || /(_test|\.test|\.spec)\.(dart|ts|tsx|js|py)$/.test(file);
}

function bestTestTarget(testFile: string, sourceFiles: string[]): { path: string; confidence: number } | null {
  const basename = path.posix
    .basename(testFile)
    .replace(/(_test|\.test|\.spec)\.[^.]+$/, "")
    .replace(/\.[^.]+$/, "");
  const normalized = basename.replace(/^test_/, "");
  const exact = sourceFiles.find((file) => path.posix.basename(file).replace(/\.[^.]+$/, "") === normalized);
  if (exact) {
    return { path: exact, confidence: 0.9 };
  }
  const byName = sourceFiles.find((file) => file.toLowerCase().includes(normalized.toLowerCase()));
  return byName ? { path: byName, confidence: 0.55 } : null;
}

function commandForTestFile(testFile: string): string {
  if (testFile.startsWith("frontend/") && testFile.endsWith(".dart")) {
    return `cd frontend && flutter test ${testFile.replace(/^frontend\//, "")}`;
  }
  if (testFile.endsWith(".py")) {
    return `pytest ${testFile}`;
  }
  if (testFile.endsWith(".ts") || testFile.endsWith(".js")) {
    return `npx vitest run ${testFile}`;
  }
  return "";
}

function insertCommands(
  db: ProjectDatabase,
  repoId: number,
  commands: { name: string; command: string; sourceFile: string; category: string }[]
): void {
  const stmt = db.prepare(
    "INSERT INTO commands (repo_id, name, command, source_file, category) VALUES (?, ?, ?, ?, ?)"
  );
  const insert = db.transaction(() => {
    for (const command of commands) {
      stmt.run(repoId, command.name, command.command, command.sourceFile, command.category);
    }
  });
  insert();
}

function insertRules(
  db: ProjectDatabase,
  repoId: number,
  rules: { sourceFile: string; title: string | null; body: string; category: string }[]
): void {
  const stmt = db.prepare(
    "INSERT INTO project_rules (repo_id, source_file, title, body, category) VALUES (?, ?, ?, ?, ?)"
  );
  const insert = db.transaction(() => {
    for (const rule of rules) {
      stmt.run(repoId, rule.sourceFile, rule.title, rule.body, rule.category);
    }
  });
  insert();
}

function insertCoChanges(
  db: ProjectDatabase,
  repoId: number,
  fileRows: Map<string, number>,
  coChanges: { fromPath: string; toPath: string; weight: number }[]
): void {
  const stmt = db.prepare(
    "INSERT INTO edges (repo_id, from_type, from_id, to_type, to_id, kind, weight, confidence) VALUES (?, 'file', ?, 'file', ?, 'co_changes', ?, 0.65)"
  );
  const insert = db.transaction(() => {
    for (const item of coChanges) {
      const fromId = fileRows.get(item.fromPath);
      const toId = fileRows.get(item.toPath);
      if (fromId && toId) {
        stmt.run(repoId, fromId, toId, item.weight);
        stmt.run(repoId, toId, fromId, item.weight);
      }
    }
  });
  insert();
}
