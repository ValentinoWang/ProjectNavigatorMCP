import path from "node:path";
import { parseImportBindings, resolveImportPathV2 } from "../analysis/importResolverV2.js";
import { extractCallTokens } from "../analysis/callEdgeExtractor.js";
import { extractBody } from "../analysis/bodyExtractor.js";
import { fingerprintCode } from "../analysis/codeFingerprint.js";
import { structuralFingerprintForCode } from "../analysis/structuralFingerprint.js";
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
  file_path: string;
  language: string;
  name: string;
  kind: string;
  qualified_name: string | null;
  start_line: number;
  end_line: number;
  body_start_line: number | null;
  body_end_line: number | null;
}

interface BlockCalls {
  symbolId: number;
  fileId: number;
  calls: string[];
}

export interface ScanRepoOptions {
  mode?: "full" | "incremental";
  progress?: ScanProgressReporter | boolean;
}

export interface ScanProgressReporter {
  stage(name: string, payload?: Record<string, unknown>): void;
}

function resolveProgressReporter(progress: ScanRepoOptions["progress"]): ScanProgressReporter | undefined {
  if (!progress) {
    return undefined;
  }
  if (progress === true) {
    return { stage: () => undefined };
  }
  return progress;
}

export function scanRepo(repoPath: string, options: ScanRepoOptions = {}): ScanResult {
  initProject(repoPath);
  const project = openProject(repoPath);
  try {
    return scanIntoDatabase(
      project.db,
      project.repo.id,
      project.repoRoot,
      options.mode ?? "full",
      resolveProgressReporter(options.progress)
    );
  } finally {
    project.db.close();
  }
}

function scanIntoDatabase(
  db: ProjectDatabase,
  repoId: number,
  repoRoot: string,
  mode: "full" | "incremental",
  progress?: ScanProgressReporter
): ScanResult {
  const startedAt = Date.now();
  const gitSha = getGitSha(repoRoot);
  const scanRun = db
    .prepare("INSERT INTO scan_runs (repo_id, git_sha, status) VALUES (?, ?, 'running')")
    .run(repoId, gitSha);
  const scanRunId = Number(scanRun.lastInsertRowid);

  try {
    progress?.stage("loading_config");
    const config = loadProjectConfig(repoRoot);
    rebuildFtsTables(db);
    const oldHashes = loadExistingHashes(db, repoId);
    progress?.stage("hashing_files");
    const files = scanFiles(repoRoot, config);
    const incremental = incrementalStats(mode, oldHashes, files, startedAt);
    progress?.stage("incremental_diff", {
      changed: incremental.filesChanged,
      deleted: incremental.filesDeleted,
      changeKind: incremental.changeKind
    });
    if (mode === "incremental" && incremental.filesChanged === 0 && incremental.filesDeleted === 0) {
      db.prepare("UPDATE scan_runs SET finished_at = CURRENT_TIMESTAMP, status = 'success' WHERE id = ?").run(
        scanRunId
      );
      return {
        ...previousScanResult(db, repoId, repoRoot, gitSha),
        incremental: { ...incremental, durationMs: Date.now() - startedAt }
      };
    }
    if (mode === "incremental" && incremental.changeKind !== "code_graph") {
      progress?.stage("lightweight_incremental", { changeKind: incremental.changeKind });
      applyLightweightIncremental(db, repoId, repoRoot, files, incremental);
      db.prepare("UPDATE scan_runs SET finished_at = CURRENT_TIMESTAMP, status = 'success' WHERE id = ?").run(
        scanRunId
      );
      return {
        ...previousScanResult(db, repoId, repoRoot, gitSha),
        incremental: { ...incremental, durationMs: Date.now() - startedAt }
      };
    }
    progress?.stage("conservative_rebuild");
    progress?.stage("clearing_scanned_data");
    clearScannedData(db, repoId);
    progress?.stage("inserting_files", { files: files.length });
    insertFiles(db, repoId, files);
    const fileRows = loadFileRows(db, repoId);

    progress?.stage("scanning_symbols_imports_routes", { files: files.length });
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
    const symbolRows = loadSymbolRows(db, repoId);
    const blockCalls = insertCodeBlocks(db, repoId, repoRoot, symbolRows, config.maxFileBytes);
    insertSymbolEdges(db, repoId, symbolRows, blockCalls);
    insertModules(
      db,
      repoId,
      files.map((file) => file.path)
    );
    insertContainsEdges(db, repoId, fileRows, symbolRows);
    insertImportEdges(db, repoId, fileRows, imports);
    insertImportBindings(db, repoId, fileRows, imports);
    insertRoutes(db, repoId, fileRows, symbolRows, routes);
    const testCount = insertTestEdges(db, repoId, fileRows);

    progress?.stage("scanning_commands");
    const commands = scanCommands(repoRoot);
    insertCommands(db, repoId, commands);

    progress?.stage("scanning_rules_documents");
    const rules = scanRules(repoRoot);
    insertRules(db, repoId, rules);

    const documents = scanSourceDocuments(repoRoot, files);
    insertSourceDocuments(db, repoId, fileRows, documents);

    progress?.stage("scanning_cochanges_duplicates");
    const coChanges = scanCoChanges(repoRoot, new Set(files.map((file) => file.path)));
    insertCoChanges(db, repoId, fileRows, coChanges);
    insertDuplicateClusters(db, repoId);

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
      coChanges: coChanges.length,
      incremental: mode === "incremental" ? { ...incremental, durationMs: Date.now() - startedAt } : undefined
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

function applyLightweightIncremental(
  db: ProjectDatabase,
  repoId: number,
  repoRoot: string,
  files: ScannedFile[],
  incremental: NonNullable<ScanResult["incremental"]>
): void {
  upsertChangedFiles(db, repoId, files, incremental.changedPaths);
  markDeletedFiles(db, repoId, incremental.deletedPaths);
  if (incremental.changeKind === "commands_only") {
    db.prepare("DELETE FROM commands WHERE repo_id = ?").run(repoId);
    insertCommands(db, repoId, scanCommands(repoRoot));
  }
  if (incremental.changeKind === "docs_only") {
    db.prepare("DELETE FROM project_rules WHERE repo_id = ?").run(repoId);
    db.prepare("DELETE FROM document_steps WHERE repo_id = ?").run(repoId);
    db.prepare("DELETE FROM document_targets WHERE repo_id = ?").run(repoId);
    db.prepare("DELETE FROM documents WHERE repo_id = ?").run(repoId);
    insertRules(db, repoId, scanRules(repoRoot));
    insertSourceDocuments(db, repoId, loadFileRows(db, repoId), scanSourceDocuments(repoRoot, files));
  }
}

function upsertChangedFiles(db: ProjectDatabase, repoId: number, files: ScannedFile[], changedPaths: string[]): void {
  const changed = new Set(changedPaths);
  const stmt = db.prepare(
    `INSERT INTO files (repo_id, path, language, size, hash, last_scanned_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
     ON CONFLICT(repo_id, path) DO UPDATE SET
       language = excluded.language,
       size = excluded.size,
       hash = excluded.hash,
       last_scanned_at = CURRENT_TIMESTAMP,
       deleted_at = NULL`
  );
  const insert = db.transaction(() => {
    for (const file of files) {
      if (changed.has(file.path)) {
        stmt.run(repoId, file.path, file.language, file.size, file.hash);
      }
    }
  });
  insert();
}

function markDeletedFiles(db: ProjectDatabase, repoId: number, deletedPaths: string[]): void {
  const stmt = db.prepare("UPDATE files SET deleted_at = CURRENT_TIMESTAMP WHERE repo_id = ? AND path = ?");
  const update = db.transaction(() => {
    for (const filePath of deletedPaths) {
      stmt.run(repoId, filePath);
    }
  });
  update();
}

function clearScannedData(db: ProjectDatabase, repoId: number): void {
  db.prepare("DELETE FROM edges WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM semantic_edges WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM structural_fingerprints WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM import_bindings WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM symbol_edges WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM code_blocks WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM modules WHERE repo_id = ?").run(repoId);
  db.prepare(
    "DELETE FROM similarity_members WHERE cluster_id IN (SELECT id FROM similarity_clusters WHERE repo_id = ?)"
  ).run(repoId);
  db.prepare("DELETE FROM similarity_clusters WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM routes WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM tests WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM commands WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM project_rules WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM document_steps WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM document_targets WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM documents WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM symbols WHERE file_id IN (SELECT id FROM files WHERE repo_id = ?)").run(repoId);
  db.prepare("DELETE FROM files WHERE repo_id = ?").run(repoId);
}

function insertFiles(db: ProjectDatabase, repoId: number, files: ScannedFile[]): void {
  const stmt = db.prepare(
    "INSERT INTO files (repo_id, path, language, size, hash, last_scanned_at, deleted_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)"
  );
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
    `INSERT INTO symbols
      (file_id, name, kind, signature, qualified_name, container_name, parameters_json, return_type,
       visibility, body_start_line, body_end_line, language_kind, start_line, end_line)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insert = db.transaction(() => {
    for (const item of symbols) {
      const fileId = fileRows.get(item.filePath);
      if (fileId) {
        stmt.run(
          fileId,
          item.name,
          item.kind,
          item.signature,
          item.qualifiedName,
          item.containerName ?? null,
          JSON.stringify(item.parameters ?? []),
          item.returnType ?? null,
          item.visibility ?? null,
          item.bodyStartLine ?? item.startLine,
          item.bodyEndLine ?? item.endLine,
          item.languageKind ?? null,
          item.startLine,
          item.endLine
        );
      }
    }
  });
  insert();
}

function loadSymbolRows(db: ProjectDatabase, repoId: number): SymbolRow[] {
  return db
    .prepare(
      `SELECT s.id, s.file_id, f.path AS file_path, f.language, s.name, s.kind, s.qualified_name,
              s.start_line, s.end_line, s.body_start_line, s.body_end_line
       FROM symbols s JOIN files f ON f.id = s.file_id
       WHERE f.repo_id = ?`
    )
    .all(repoId) as SymbolRow[];
}

function insertCodeBlocks(
  db: ProjectDatabase,
  repoId: number,
  repoRoot: string,
  symbols: SymbolRow[],
  maxFileBytes: number
): BlockCalls[] {
  const byFile = new Map<string, string | null>();
  const stmt = db.prepare(
    `INSERT INTO code_blocks
      (repo_id, file_id, symbol_id, kind, path, name, qualified_name, start_line, end_line,
       body_hash, normalized_hash, fingerprint, tokens_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const structuralStmt = db.prepare(
    `INSERT INTO structural_fingerprints
      (repo_id, block_id, shape_kind, shape_hash, shape_json, tokens_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updateSymbol = db.prepare("UPDATE symbols SET body_hash = ?, normalized_fingerprint = ? WHERE id = ?");
  const calls: BlockCalls[] = [];
  const insert = db.transaction(() => {
    for (const symbol of symbols) {
      if (!byFile.has(symbol.file_path)) {
        byFile.set(symbol.file_path, readRepoTextFile(repoRoot, symbol.file_path, maxFileBytes));
      }
      const content = byFile.get(symbol.file_path);
      if (!content) {
        continue;
      }
      const startLine = symbol.body_start_line ?? symbol.start_line;
      const endLine = symbol.body_end_line ?? symbol.end_line;
      const body = extractBody(content, startLine, endLine);
      const fingerprint = fingerprintCode(body);
      const inserted = stmt.run(
        repoId,
        symbol.file_id,
        symbol.id,
        symbol.kind,
        symbol.file_path,
        symbol.name,
        symbol.qualified_name,
        startLine,
        endLine,
        fingerprint.bodyHash,
        fingerprint.normalizedHash,
        fingerprint.fingerprint,
        JSON.stringify(fingerprint.tokens.slice(0, 300))
      );
      const structural = structuralFingerprintForCode(symbol.language, body);
      structuralStmt.run(
        repoId,
        Number(inserted.lastInsertRowid),
        structural.shapeKind,
        structural.shapeHash,
        JSON.stringify(structural.shapeJson),
        JSON.stringify(structural.tokens.slice(0, 200))
      );
      updateSymbol.run(fingerprint.bodyHash, fingerprint.fingerprint, symbol.id);
      calls.push({ symbolId: symbol.id, fileId: symbol.file_id, calls: extractCallTokens(body) });
    }
  });
  insert();
  return calls;
}

function insertSymbolEdges(db: ProjectDatabase, repoId: number, symbols: SymbolRow[], blockCalls: BlockCalls[]): void {
  const byName = new Map<string, SymbolRow[]>();
  for (const symbol of symbols) {
    const entries = byName.get(symbol.name) ?? [];
    entries.push(symbol);
    byName.set(symbol.name, entries);
  }
  const stmt = db.prepare(
    `INSERT INTO symbol_edges
      (repo_id, from_symbol_id, to_symbol_id, from_file_id, to_file_id, kind, confidence, evidence_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const seen = new Set<string>();
  const insert = db.transaction(() => {
    for (const block of blockCalls) {
      for (const call of block.calls) {
        const candidates = (byName.get(call) ?? []).filter((candidate) => candidate.id !== block.symbolId);
        const target = chooseCallTarget(candidates, block.fileId);
        if (!target) {
          continue;
        }
        const key = `${block.symbolId}:${target.symbol.id}:calls`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        stmt.run(
          repoId,
          block.symbolId,
          target.symbol.id,
          block.fileId,
          target.symbol.file_id,
          /^[A-Z]/.test(call) ? "constructs" : "calls",
          target.confidence,
          JSON.stringify(target.evidence)
        );
      }
    }
  });
  insert();
}

function chooseCallTarget(
  candidates: SymbolRow[],
  fromFileId: number
): { symbol: SymbolRow; confidence: number; evidence: string[] } | null {
  if (candidates.length === 0) {
    return null;
  }
  const sameFile = candidates.find((candidate) => candidate.file_id === fromFileId);
  if (sameFile) {
    return { symbol: sameFile, confidence: 0.95, evidence: ["exact_local"] };
  }
  if (candidates.length === 1) {
    return { symbol: candidates[0], confidence: 0.75, evidence: ["repo_unique_name"] };
  }
  return { symbol: candidates[0], confidence: 0.45, evidence: ["ambiguous_name"] };
}

function insertModules(db: ProjectDatabase, repoId: number, files: string[]): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO modules (repo_id, name, root_path, module_type, summary) VALUES (?, ?, ?, ?, ?)"
  );
  const roots = new Map<string, { name: string; type: string; count: number }>();
  for (const file of files) {
    const module = inferModule(file);
    if (!module) {
      continue;
    }
    const current = roots.get(module.rootPath) ?? { name: module.name, type: module.type, count: 0 };
    current.count += 1;
    roots.set(module.rootPath, current);
  }
  const insert = db.transaction(() => {
    for (const [rootPath, module] of roots) {
      stmt.run(repoId, module.name, rootPath, module.type, `${module.count} indexed files`);
    }
  });
  insert();
}

function inferModule(filePath: string): { name: string; rootPath: string; type: string } | null {
  const parts = filePath.split("/");
  if (parts[0] === "frontend" && parts[1] === "lib" && parts[2] === "modules" && parts[3]) {
    const name = parts.slice(3, Math.min(parts.length - 1, 5)).join("/");
    return { name, rootPath: ["frontend", "lib", "modules", ...name.split("/")].join("/"), type: "flutter_module" };
  }
  if (parts[0] === "backend" && parts[1] === "app" && parts[2]) {
    const name = parts.slice(2, Math.min(parts.length - 1, 4)).join("/");
    return { name, rootPath: ["backend", "app", ...name.split("/")].join("/"), type: "backend_area" };
  }
  if (parts[0] === "src" && parts[1]) {
    return { name: parts[1], rootPath: `src/${parts[1]}`, type: "source_module" };
  }
  if ((parts[0] === "packages" || parts[0] === "apps") && parts[1]) {
    return { name: parts[1], rootPath: `${parts[0]}/${parts[1]}`, type: parts[0].slice(0, -1) };
  }
  return null;
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
      const toPath = resolveImportPathV2(item.fromPath, item.importText, new Set(fileRows.keys()));
      const toId = toPath ? fileRows.get(toPath) : undefined;
      if (fromId && toId) {
        stmt.run(repoId, fromId, toId, item.importText.startsWith(".") ? 0.9 : 0.62);
      }
    }
  });
  insert();
}

function insertImportBindings(
  db: ProjectDatabase,
  repoId: number,
  fileRows: Map<string, number>,
  imports: ScannedImport[]
): void {
  const filePaths = new Set(fileRows.keys());
  const stmt = db.prepare(
    `INSERT INTO import_bindings
      (repo_id, file_id, imported_name, local_name, source_text, resolved_file_id, confidence, evidence_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insert = db.transaction(() => {
    for (const item of imports) {
      const fileId = fileRows.get(item.fromPath);
      if (!fileId) {
        continue;
      }
      for (const binding of parseImportBindings(item.fromPath, item.importText, filePaths)) {
        stmt.run(
          repoId,
          fileId,
          binding.importedName,
          binding.localName,
          binding.sourceText,
          binding.resolvedPath ? (fileRows.get(binding.resolvedPath) ?? null) : null,
          binding.confidence,
          JSON.stringify(binding.evidence)
        );
      }
    }
  });
  insert();
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

function insertDuplicateClusters(db: ProjectDatabase, repoId: number): void {
  const groups = db
    .prepare(
      `SELECT normalized_hash AS normalizedHash, COUNT(*) AS count, MIN(id) AS representative
       FROM code_blocks
       WHERE repo_id = ? AND normalized_hash IS NOT NULL AND json_array_length(tokens_json) > 8
       GROUP BY normalized_hash
       HAVING COUNT(*) > 1
       LIMIT 200`
    )
    .all(repoId) as Array<{ normalizedHash: string; count: number; representative: number }>;
  const clusterStmt = db.prepare(
    "INSERT INTO similarity_clusters (repo_id, cluster_type, representative_block_id, score, summary) VALUES (?, 'exact_duplicate', ?, 1.0, ?)"
  );
  const memberStmt = db.prepare(
    "INSERT INTO similarity_members (cluster_id, block_id, similarity, reason) VALUES (?, ?, 1.0, 'normalized_hash match')"
  );
  const blocksStmt = db.prepare("SELECT id FROM code_blocks WHERE repo_id = ? AND normalized_hash = ?");
  const insert = db.transaction(() => {
    for (const group of groups) {
      const cluster = clusterStmt.run(
        repoId,
        group.representative,
        `${group.count} code blocks share a normalized body`
      );
      const clusterId = Number(cluster.lastInsertRowid);
      const blocks = blocksStmt.all(repoId, group.normalizedHash) as Array<{ id: number }>;
      for (const block of blocks) {
        memberStmt.run(clusterId, block.id);
      }
    }
  });
  insert();
}

function loadExistingHashes(db: ProjectDatabase, repoId: number): Map<string, string | null> {
  const rows = db
    .prepare("SELECT path, hash FROM files WHERE repo_id = ? AND deleted_at IS NULL")
    .all(repoId) as Array<{
    path: string;
    hash: string | null;
  }>;
  return new Map(rows.map((row) => [row.path, row.hash]));
}

function incrementalStats(
  mode: "full" | "incremental",
  oldHashes: Map<string, string | null>,
  files: ScannedFile[],
  startedAt: number
): NonNullable<ScanResult["incremental"]> {
  const newPaths = new Set(files.map((file) => file.path));
  const changedPaths = files.filter((file) => oldHashes.get(file.path) !== file.hash).map((file) => file.path);
  const deletedPaths = Array.from(oldHashes.keys()).filter((oldPath) => !newPaths.has(oldPath));
  const changeKind =
    mode === "incremental" && changedPaths.length === 0 && deletedPaths.length === 0
      ? "none"
      : classifyIncrementalChange(changedPaths, deletedPaths);
  return {
    mode,
    filesTotal: files.length,
    filesChanged: changedPaths.length,
    filesSkipped: Math.max(0, files.length - changedPaths.length),
    filesDeleted: deletedPaths.length,
    durationMs: Date.now() - startedAt,
    changedPaths: changedPaths.slice(0, 100),
    deletedPaths: deletedPaths.slice(0, 100),
    changeKind,
    stages: changeKind === "code_graph" ? ["conservative_rebuild"] : [changeKind],
    conservativeFullRebuild: mode === "incremental" && changeKind === "code_graph"
  };
}

function classifyIncrementalChange(
  changedPaths: string[],
  deletedPaths: string[]
): NonNullable<ScanResult["incremental"]>["changeKind"] {
  const paths = [...changedPaths, ...deletedPaths];
  if (paths.length === 0) {
    return "none";
  }
  if (paths.every(isWorkflowProfilePath)) {
    return "workflow_profiles_only";
  }
  if (paths.every(isEvalOnlyPath)) {
    return "eval_only";
  }
  if (paths.every(isCommandSourcePath)) {
    return "commands_only";
  }
  if (paths.every(isDocsOnlyPath)) {
    return "docs_only";
  }
  return "code_graph";
}

function isWorkflowProfilePath(filePath: string): boolean {
  return /^(\.agents\/pnav|\.pnav)\/workflow-profiles\.json$/.test(filePath);
}

function isEvalOnlyPath(filePath: string): boolean {
  return (
    /^(\.agents\/pnav|\.pnav)\/.*(eval|suite|discovery-suite).*\.json$/.test(filePath) ||
    /^agents-results\//.test(filePath)
  );
}

function isCommandSourcePath(filePath: string): boolean {
  return /(^|\/)(Makefile|package\.json|package-lock\.json|pubspec\.ya?ml|pyproject\.toml)$/.test(filePath);
}

function isDocsOnlyPath(filePath: string): boolean {
  return (
    /(^|\/)(AGENTS|CLAUDE|README)\.md$/.test(filePath) ||
    /^docs\//.test(filePath) ||
    /^\.agents\/skills\/.*\.md$/.test(filePath)
  );
}

function previousScanResult(db: ProjectDatabase, repoId: number, repoRoot: string, gitSha: string | null): ScanResult {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE repo_id = ?`).get(repoId) as { count: number }).count;
  return {
    repoRoot,
    gitSha,
    files: count("files"),
    symbols: (
      db
        .prepare("SELECT COUNT(*) AS count FROM symbols s JOIN files f ON f.id = s.file_id WHERE f.repo_id = ?")
        .get(repoId) as { count: number }
    ).count,
    imports: count("import_bindings"),
    routes: count("routes"),
    tests: count("tests"),
    commands: count("commands"),
    rules: count("project_rules"),
    documents: count("documents"),
    coChanges: (
      db.prepare("SELECT COUNT(*) AS count FROM edges WHERE repo_id = ? AND kind = 'co_changes'").get(repoId) as {
        count: number;
      }
    ).count
  };
}
