import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
import { compareGraphSnapshots } from "../graph/graphEquivalence.js";
import { graphSnapshot, snapshotProjectDb } from "../graph/graphSnapshot.js";
import { readRepoTextFile, scanFiles } from "./fileScanner.js";
import { scanCommands } from "./commandScanner.js";
import { getGitSha, scanCoChanges } from "./gitScanner.js";
import { scanRules } from "./ruleScanner.js";
import { scanTextSymbols } from "./symbolScanner.js";
import type {
  IncrementalChangeKind,
  IncrementalChangePlanes,
  ScanResult,
  ScannedFile,
  ScannedImport,
  ScannedRoute,
  ScannedSymbol
} from "./types.js";

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

interface IncomingSymbolEdgeSnapshot {
  fromSymbolId: number;
  fromFileId: number;
  toFileId: number;
  targetKey: string;
  kind: string;
  confidence: number;
  evidenceJson: string;
}

interface AffectedCallerPlan {
  callerIds: number[];
  candidateCallers: number;
  skippedCallers: number;
  reason: string;
}

const MAX_TOKEN_CALLER_SEARCH_FILES = 3;

export interface ScanRepoOptions {
  mode?: "full" | "incremental";
  metadataOnly?: boolean;
  incrementalCodeFileLimit?: number;
  batchIncrementalCodeFileLimit?: number;
  verifyPartial?: boolean;
  compareFull?: boolean;
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
      options,
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
  options: ScanRepoOptions,
  progress?: ScanProgressReporter
): ScanResult {
  const mode = options.mode ?? "full";
  const metadataOnly = Boolean(options.metadataOnly);
  const incrementalCodeFileLimit = options.incrementalCodeFileLimit ?? 20;
  const batchIncrementalCodeFileLimit = options.batchIncrementalCodeFileLimit ?? 100;
  const startedAt = Date.now();
  const gitSha = getGitSha(repoRoot);
  const scanRun = db
    .prepare("INSERT INTO scan_runs (repo_id, git_sha, status) VALUES (?, ?, 'running')")
    .run(repoId, gitSha);
  const scanRunId = Number(scanRun.lastInsertRowid);

  try {
    progress?.stage("loading_config");
    const config = loadProjectConfig(repoRoot);
    const oldHashes = loadExistingHashes(db, repoId);
    progress?.stage("hashing_files");
    const files = scanFiles(repoRoot, config);
    const incremental = incrementalStats(mode, oldHashes, files, startedAt, {
      metadataOnly,
      incrementalCodeFileLimit,
      batchIncrementalCodeFileLimit,
      verifyPartial: Boolean(options.verifyPartial),
      compareFull: Boolean(options.compareFull)
    });
    progress?.stage("incremental_diff", {
      changed: incremental.filesChanged,
      deleted: incremental.filesDeleted,
      changeKind: incremental.changeKind,
      changePlanes: incremental.changePlaneCounts,
      actions: incremental.actions
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
    if (mode === "incremental" && metadataOnly) {
      progress?.stage("metadata_only_incremental", {
        changeKind: incremental.changeKind,
        codeGraphStale: incremental.codeGraphStale
      });
      applyMetadataOnlyIncremental(db, repoId, repoRoot, files, incremental);
      rebuildFtsTables(db);
      db.prepare("UPDATE scan_runs SET finished_at = CURRENT_TIMESTAMP, status = 'success' WHERE id = ?").run(
        scanRunId
      );
      return {
        ...previousScanResult(db, repoId, repoRoot, gitSha),
        incremental: { ...incremental, durationMs: Date.now() - startedAt }
      };
    }
    if (mode === "incremental" && incremental.changePlanes.codeGraph.length === 0) {
      progress?.stage("lightweight_incremental", { changeKind: incremental.changeKind });
      applyLightweightIncremental(db, repoId, repoRoot, files, incremental);
      rebuildFtsTables(db);
      db.prepare("UPDATE scan_runs SET finished_at = CURRENT_TIMESTAMP, status = 'success' WHERE id = ?").run(
        scanRunId
      );
      return {
        ...previousScanResult(db, repoId, repoRoot, gitSha),
        incremental: { ...incremental, durationMs: Date.now() - startedAt }
      };
    }
    if (mode === "incremental" && incremental.partialGraphUpdate) {
      progress?.stage("partial_graph_update", {
        files: incremental.changePlaneCounts.codeGraph,
        limit: batchIncrementalCodeFileLimit
      });
      applyFileLevelGraphIncremental(db, repoId, repoRoot, files, incremental, config.maxFileBytes);
      if (options.compareFull) {
        progress?.stage("partial_compare_full");
        incremental.partialVerification = verifyPartialAgainstFull(db, repoId, repoRoot);
      }
      rebuildFtsTables(db);
      db.prepare("UPDATE scan_runs SET finished_at = CURRENT_TIMESTAMP, status = 'success' WHERE id = ?").run(
        scanRunId
      );
      return {
        ...previousScanResult(db, repoId, repoRoot, gitSha),
        incremental: { ...incremental, durationMs: Date.now() - startedAt }
      };
    }
    progress?.stage("conservative_rebuild");
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

    progress?.stage("scanning_commands");
    const commands = scanCommands(repoRoot);

    progress?.stage("scanning_rules_documents");
    const rules = scanRules(repoRoot);
    const documents = scanSourceDocuments(repoRoot, files);

    progress?.stage("scanning_cochanges_duplicates");
    const coChanges = scanCoChanges(repoRoot, new Set(files.map((file) => file.path)));

    progress?.stage("replacing_scanned_data");
    const rebuild = db.transaction(() => {
      progress?.stage("clearing_scanned_data");
      clearScannedData(db, repoId);
      progress?.stage("clearing_scanned_data_done");

      progress?.stage("inserting_files", { files: files.length });
      insertFiles(db, repoId, files);
      const fileRows = loadFileRows(db, repoId);

      progress?.stage("inserting_symbols_imports_routes", {
        symbols: symbols.length,
        imports: imports.length,
        routes: routes.length
      });
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

      progress?.stage("inserting_commands");
      insertCommands(db, repoId, commands);

      progress?.stage("inserting_rules_documents");
      insertRules(db, repoId, rules);
      insertSourceDocuments(db, repoId, fileRows, documents);

      progress?.stage("inserting_cochanges_duplicates");
      insertCoChanges(db, repoId, fileRows, coChanges);
      insertDuplicateClusters(db, repoId);

      db.prepare("UPDATE scan_runs SET finished_at = CURRENT_TIMESTAMP, status = 'success' WHERE id = ?").run(
        scanRunId
      );
      return { testCount };
    });
    const { testCount } = rebuild();
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
  if (incremental.changePlanes.commandSources.length > 0) {
    db.prepare("DELETE FROM commands WHERE repo_id = ?").run(repoId);
    insertCommands(db, repoId, scanCommands(repoRoot));
  }
  if (incremental.changePlanes.docs.length > 0) {
    refreshRulesAndDocuments(db, repoId, repoRoot, files);
  }
}

function applyMetadataOnlyIncremental(
  db: ProjectDatabase,
  repoId: number,
  repoRoot: string,
  files: ScannedFile[],
  incremental: NonNullable<ScanResult["incremental"]>
): void {
  const metadataChanged = metadataPlanePaths(incremental.changePlanes, incremental.changedPaths);
  const metadataDeleted = metadataPlanePaths(incremental.changePlanes, incremental.deletedPaths);
  upsertChangedFiles(db, repoId, files, metadataChanged);
  markDeletedFiles(db, repoId, metadataDeleted);
  if (incremental.changePlanes.commandSources.length > 0) {
    db.prepare("DELETE FROM commands WHERE repo_id = ?").run(repoId);
    insertCommands(db, repoId, scanCommands(repoRoot));
  }
  if (incremental.changePlanes.docs.length > 0) {
    refreshRulesAndDocuments(db, repoId, repoRoot, files);
  }
}

function refreshRulesAndDocuments(db: ProjectDatabase, repoId: number, repoRoot: string, files: ScannedFile[]): void {
  db.prepare("DELETE FROM project_rules WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM document_steps WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM document_targets WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM documents WHERE repo_id = ?").run(repoId);
  insertRules(db, repoId, scanRules(repoRoot));
  insertSourceDocuments(db, repoId, loadFileRows(db, repoId), scanSourceDocuments(repoRoot, files));
}

function metadataPlanePaths(planes: IncrementalChangePlanes, candidatePaths: string[]): string[] {
  const metadata = new Set([
    ...planes.workflowProfiles,
    ...planes.evalSuites,
    ...planes.commandSources,
    ...planes.docs
  ]);
  return candidatePaths.filter((filePath) => metadata.has(filePath));
}

function applyFileLevelGraphIncremental(
  db: ProjectDatabase,
  repoId: number,
  repoRoot: string,
  files: ScannedFile[],
  incremental: NonNullable<ScanResult["incremental"]>,
  maxFileBytes: number
): void {
  upsertChangedFiles(db, repoId, files, incremental.changedPaths);
  markDeletedFiles(db, repoId, incremental.deletedPaths);
  if (incremental.changePlanes.commandSources.length > 0) {
    db.prepare("DELETE FROM commands WHERE repo_id = ?").run(repoId);
    insertCommands(db, repoId, scanCommands(repoRoot));
  }
  if (incremental.changePlanes.docs.length > 0) {
    refreshRulesAndDocuments(db, repoId, repoRoot, files);
  }

  const changedCodePaths = new Set(incremental.changedPaths.filter((filePath) => isCodeGraphPath(filePath)));
  const deletedCodePaths = new Set(incremental.deletedPaths.filter((filePath) => isCodeGraphPath(filePath)));
  if (changedCodePaths.size === 0 && deletedCodePaths.size === 0) {
    return;
  }
  const fileRows = loadFileRows(db, repoId);
  const changedIds = Array.from(changedCodePaths)
    .map((filePath) => fileRows.get(filePath))
    .filter((fileId): fileId is number => fileId !== undefined);
  const deletedIds = Array.from(deletedCodePaths)
    .map((filePath) => fileRows.get(filePath))
    .filter((fileId): fileId is number => fileId !== undefined);
  const targetIds = Array.from(new Set([...changedIds, ...deletedIds]));
  if (targetIds.length === 0) {
    return;
  }

  const callerPlan = findAffectedCallerFileIds(db, repoId, targetIds, fileRows);
  const callerIds = callerPlan.callerIds.filter((fileId) => !targetIds.includes(fileId));
  const reindexIds = Array.from(new Set([...changedIds, ...callerIds]));
  const invalidatedIds = Array.from(new Set([...targetIds, ...callerIds]));
  const incoming = snapshotIncomingSymbolEdges(db, repoId, invalidatedIds);
  clearChangedFileGraphRows(db, repoId, invalidatedIds);

  const symbols: ScannedSymbol[] = [];
  const imports: ScannedImport[] = [];
  const routes: ScannedRoute[] = [];
  const reindexPaths = new Set(
    Array.from(fileRows.entries())
      .filter(([, fileId]) => reindexIds.includes(fileId))
      .map(([filePath]) => filePath)
      .filter((filePath) => !deletedCodePaths.has(filePath))
  );
  for (const file of files) {
    if (!reindexPaths.has(file.path)) {
      continue;
    }
    const content = readRepoTextFile(repoRoot, file.path, maxFileBytes);
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
  const affected = new Set(reindexIds);
  const affectedSymbols = symbolRows.filter((symbol) => affected.has(symbol.file_id));
  const activeFileRows = loadActiveFileRows(db, repoId);
  const blockCalls = insertCodeBlocks(db, repoId, repoRoot, affectedSymbols, maxFileBytes);
  insertSymbolEdges(db, repoId, symbolRows, blockCalls);
  const restoredIncomingEdges = restoreIncomingSymbolEdges(db, repoId, incoming, symbolRows);
  insertContainsEdges(
    db,
    repoId,
    new Map(Array.from(fileRows.entries()).filter(([, id]) => affected.has(id))),
    affectedSymbols
  );
  insertImportEdges(db, repoId, activeFileRows, imports);
  insertImportBindings(db, repoId, activeFileRows, imports);
  insertRoutes(db, repoId, activeFileRows, symbolRows, routes);

  db.prepare("DELETE FROM tests WHERE repo_id = ?").run(repoId);
  db.prepare("DELETE FROM edges WHERE repo_id = ? AND kind = 'covered_by'").run(repoId);
  insertTestEdges(db, repoId, activeFileRows);

  db.prepare("DELETE FROM modules WHERE repo_id = ?").run(repoId);
  insertModules(
    db,
    repoId,
    files.map((file) => file.path)
  );
  db.prepare(
    "DELETE FROM similarity_members WHERE cluster_id IN (SELECT id FROM similarity_clusters WHERE repo_id = ?)"
  ).run(repoId);
  db.prepare("DELETE FROM similarity_clusters WHERE repo_id = ?").run(repoId);
  insertDuplicateClusters(db, repoId);
  incremental.invalidatedFiles = invalidatedIds.length;
  incremental.reindexedFiles = reindexIds.length;
  incremental.staleEdges = Math.max(0, incoming.length - restoredIncomingEdges);
  incremental.affectedCallerExpansion = {
    enabled: true,
    changedFiles: changedIds.length,
    candidateCallers: callerPlan.candidateCallers,
    reindexedCallers: callerIds.length,
    skippedCallers: callerPlan.skippedCallers,
    staleIncomingEdges: incremental.staleEdges,
    reason: callerPlan.reason
  };
}

function findAffectedCallerFileIds(
  db: ProjectDatabase,
  repoId: number,
  targetFileIds: number[],
  fileRows: Map<string, number>
): AffectedCallerPlan {
  if (targetFileIds.length === 0) {
    return { callerIds: [], candidateCallers: 0, skippedCallers: 0, reason: "not_applicable" };
  }
  const placeholders = sqlPlaceholders(targetFileIds);
  const callers = new Set<number>();
  const edgeRows = db
    .prepare(
      `SELECT from_id AS fileId
       FROM edges
       WHERE repo_id = ? AND kind = 'imports' AND to_type = 'file' AND to_id IN (${placeholders})`
    )
    .all(repoId, ...targetFileIds) as Array<{ fileId: number }>;
  for (const row of edgeRows) {
    callers.add(row.fileId);
  }
  const bindingRows = db
    .prepare(
      `SELECT file_id AS fileId
       FROM import_bindings
       WHERE repo_id = ? AND resolved_file_id IN (${placeholders})`
    )
    .all(repoId, ...targetFileIds) as Array<{ fileId: number }>;
  for (const row of bindingRows) {
    callers.add(row.fileId);
  }
  const symbolRows = db
    .prepare(
      `SELECT from_file_id AS fileId
       FROM symbol_edges
       WHERE repo_id = ? AND to_file_id IN (${placeholders})`
    )
    .all(repoId, ...targetFileIds) as Array<{ fileId: number }>;
  for (const row of symbolRows) {
    callers.add(row.fileId);
  }
  const shouldSearchSymbolTokens = targetFileIds.length <= MAX_TOKEN_CALLER_SEARCH_FILES;
  const oldSymbolNames = shouldSearchSymbolTokens
    ? (db
        .prepare(`SELECT DISTINCT name FROM symbols WHERE file_id IN (${placeholders}) AND LENGTH(name) >= 3`)
        .all(...targetFileIds) as Array<{ name: string }>)
    : [];
  if (shouldSearchSymbolTokens) {
    for (const row of oldSymbolNames.slice(0, 25)) {
      const tokenRows = db
        .prepare(
          `SELECT DISTINCT file_id AS fileId
           FROM code_blocks
           WHERE repo_id = ? AND tokens_json LIKE ? AND file_id NOT IN (${placeholders})
           LIMIT 50`
        )
        .all(repoId, `%${escapeSqlLike(row.name)}%`, ...targetFileIds) as Array<{ fileId: number }>;
      for (const tokenRow of tokenRows) {
        callers.add(tokenRow.fileId);
      }
    }
  }
  const targetPaths = new Set(
    Array.from(fileRows.entries())
      .filter(([, fileId]) => targetFileIds.includes(fileId))
      .map(([filePath]) => filePath)
  );
  for (const filePath of targetPaths) {
    const modulePrefix = sameModulePrefix(filePath);
    if (!modulePrefix) {
      continue;
    }
    const neighborRows = db
      .prepare(
        `SELECT id AS fileId
         FROM files
         WHERE repo_id = ? AND deleted_at IS NULL AND path LIKE ? AND id NOT IN (${placeholders})
         LIMIT 30`
      )
      .all(repoId, `${escapeSqlLike(modulePrefix)}%`, ...targetFileIds) as Array<{ fileId: number }>;
    for (const row of neighborRows) {
      callers.add(row.fileId);
    }
  }
  const candidateCallers = callers.size;
  const callerIds = Array.from(callers).slice(0, 100);
  const reasons = [
    "import_edges",
    "import_bindings",
    "symbol_edges",
    oldSymbolNames.length > 0 ? "symbol_token_match" : "",
    shouldSearchSymbolTokens ? "" : "skip_symbol_token_match",
    targetPaths.size > 0 ? "same_module_neighbor" : ""
  ].filter(Boolean);
  return {
    callerIds,
    candidateCallers,
    skippedCallers: Math.max(0, candidateCallers - callerIds.length),
    reason: reasons.join("_or_")
  };
}

function snapshotIncomingSymbolEdges(
  db: ProjectDatabase,
  repoId: number,
  affectedIds: number[]
): IncomingSymbolEdgeSnapshot[] {
  const placeholders = sqlPlaceholders(affectedIds);
  return db
    .prepare(
      `SELECT se.from_symbol_id AS fromSymbolId, se.from_file_id AS fromFileId,
              se.to_file_id AS toFileId, se.kind, se.confidence, se.evidence_json AS evidenceJson,
              s.name, s.qualified_name AS qualifiedName, s.kind AS symbolKind
       FROM symbol_edges se
       JOIN symbols s ON s.id = se.to_symbol_id
       WHERE se.repo_id = ?
         AND se.to_file_id IN (${placeholders})
         AND se.from_file_id NOT IN (${placeholders})`
    )
    .all(repoId, ...affectedIds, ...affectedIds)
    .map((row) => {
      const typed = row as {
        fromSymbolId: number;
        fromFileId: number;
        toFileId: number;
        kind: string;
        confidence: number;
        evidenceJson: string;
        name: string;
        qualifiedName: string | null;
        symbolKind: string;
      };
      return {
        fromSymbolId: typed.fromSymbolId,
        fromFileId: typed.fromFileId,
        toFileId: typed.toFileId,
        targetKey: symbolStableKey(typed.toFileId, typed.qualifiedName, typed.name, typed.symbolKind),
        kind: typed.kind,
        confidence: typed.confidence,
        evidenceJson: typed.evidenceJson
      };
    });
}

function clearChangedFileGraphRows(db: ProjectDatabase, repoId: number, affectedIds: number[]): void {
  const placeholders = sqlPlaceholders(affectedIds);
  db.prepare(
    `DELETE FROM structural_fingerprints
     WHERE repo_id = ? AND block_id IN (SELECT id FROM code_blocks WHERE repo_id = ? AND file_id IN (${placeholders}))`
  ).run(repoId, repoId, ...affectedIds);
  db.prepare(`DELETE FROM code_blocks WHERE repo_id = ? AND file_id IN (${placeholders})`).run(repoId, ...affectedIds);
  db.prepare(`DELETE FROM import_bindings WHERE repo_id = ? AND file_id IN (${placeholders})`).run(
    repoId,
    ...affectedIds
  );
  db.prepare(`DELETE FROM routes WHERE repo_id = ? AND file_id IN (${placeholders})`).run(repoId, ...affectedIds);
  db.prepare(
    `DELETE FROM symbol_edges WHERE repo_id = ? AND (from_file_id IN (${placeholders}) OR to_file_id IN (${placeholders}))`
  ).run(repoId, ...affectedIds, ...affectedIds);
  db.prepare(
    `DELETE FROM edges
     WHERE repo_id = ?
       AND from_type = 'file'
       AND from_id IN (${placeholders})
       AND kind IN ('contains', 'imports')`
  ).run(repoId, ...affectedIds);
  db.prepare(
    `DELETE FROM edges
     WHERE repo_id = ?
       AND to_type = 'file'
       AND to_id IN (${placeholders})
       AND kind = 'imports'`
  ).run(repoId, ...affectedIds);
  db.prepare(`DELETE FROM symbols WHERE file_id IN (${placeholders})`).run(...affectedIds);
}

function escapeSqlLike(value: string): string {
  return value.replace(/[%_]/g, (char) => `\\${char}`);
}

function sameModulePrefix(filePath: string): string | null {
  const parts = filePath.split("/");
  if (parts.length < 3) {
    return null;
  }
  if (parts[0] === "frontend" && parts[1] === "lib" && parts[2] === "modules" && parts[3]) {
    return ["frontend", "lib", "modules", parts[3]].join("/") + "/";
  }
  if (parts[0] === "backend" && parts[1] === "app" && parts[2]) {
    return ["backend", "app", parts[2]].join("/") + "/";
  }
  if (parts[0] === "src" && parts[1]) {
    return ["src", parts[1]].join("/") + "/";
  }
  const directory = path.posix.dirname(filePath);
  return directory === "." ? null : `${directory}/`;
}

function restoreIncomingSymbolEdges(
  db: ProjectDatabase,
  repoId: number,
  incoming: IncomingSymbolEdgeSnapshot[],
  symbolRows: SymbolRow[]
): number {
  if (incoming.length === 0) {
    return 0;
  }
  const byStableKey = new Map(
    symbolRows.map((symbol) => [
      symbolStableKey(symbol.file_id, symbol.qualified_name, symbol.name, symbol.kind),
      symbol
    ])
  );
  const stmt = db.prepare(
    `INSERT INTO symbol_edges
      (repo_id, from_symbol_id, to_symbol_id, from_file_id, to_file_id, kind, confidence, evidence_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insert = db.transaction(() => {
    let restored = 0;
    for (const edge of incoming) {
      const target = byStableKey.get(edge.targetKey);
      if (!target) {
        continue;
      }
      stmt.run(
        repoId,
        edge.fromSymbolId,
        target.id,
        edge.fromFileId,
        target.file_id,
        edge.kind,
        edge.confidence,
        edge.evidenceJson
      );
      restored += 1;
    }
    return restored;
  });
  return insert() as number;
}

function symbolStableKey(fileId: number, qualifiedName: string | null, name: string, kind: string): string {
  return `${fileId}:${qualifiedName ?? name}:${kind}`;
}

function sqlPlaceholders(values: unknown[]): string {
  return values.map(() => "?").join(",");
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

function loadActiveFileRows(db: ProjectDatabase, repoId: number): Map<string, number> {
  const rows = db
    .prepare("SELECT id, path FROM files WHERE repo_id = ? AND deleted_at IS NULL")
    .all(repoId) as FileRow[];
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
  startedAt: number,
  options: {
    metadataOnly: boolean;
    incrementalCodeFileLimit: number;
    batchIncrementalCodeFileLimit: number;
    verifyPartial: boolean;
    compareFull: boolean;
  }
): NonNullable<ScanResult["incremental"]> {
  const newPaths = new Set(files.map((file) => file.path));
  const changedPaths = files.filter((file) => oldHashes.get(file.path) !== file.hash).map((file) => file.path);
  const deletedPaths = Array.from(oldHashes.keys()).filter((oldPath) => !newPaths.has(oldPath));
  const changePlanes = buildChangePlanes(changedPaths, deletedPaths);
  const changePlaneCounts = countChangePlanes(changePlanes);
  const changedCodePaths = changedPaths.filter(isCodeGraphPath);
  const deletedCodePaths = deletedPaths.filter(isCodeGraphPath);
  const codeGraphPaths = Array.from(new Set([...changedCodePaths, ...deletedCodePaths]));
  const batchPartialGraphUpdate =
    mode === "incremental" &&
    !options.metadataOnly &&
    codeGraphPaths.length > options.incrementalCodeFileLimit &&
    codeGraphPaths.length <= options.batchIncrementalCodeFileLimit;
  const partialGraphUpdate =
    mode === "incremental" &&
    !options.metadataOnly &&
    codeGraphPaths.length > 0 &&
    codeGraphPaths.length <= options.batchIncrementalCodeFileLimit;
  const conservativeFullRebuild =
    mode === "incremental" && !options.metadataOnly && changePlanes.codeGraph.length > 0 && !partialGraphUpdate;
  const codeGraphStale = mode === "incremental" && options.metadataOnly && changePlanes.codeGraph.length > 0;
  const actions = incrementalActions(changePlanes, {
    codeGraphStale,
    conservativeFullRebuild,
    partialGraphUpdate,
    batchPartialGraphUpdate,
    deletedCodeFiles: deletedCodePaths.length
  });
  const changeKind = classifyIncrementalChange(changePlanes);
  return {
    mode,
    filesTotal: files.length,
    filesChanged: changedPaths.length,
    filesSkipped: Math.max(0, files.length - changedPaths.length),
    filesDeleted: deletedPaths.length,
    durationMs: Date.now() - startedAt,
    changedPaths,
    deletedPaths,
    changeKind,
    changePlanes: capChangePlanes(changePlanes),
    changePlaneCounts,
    actions,
    stages: actions,
    codeGraphStale,
    codeGraphStaleReason: codeGraphStale
      ? `${changePlanes.codeGraph.length} code graph path(s) changed; skipped graph rebuild because --metadata-only was used.`
      : undefined,
    conservativeFullRebuild,
    partialGraphUpdate,
    partialGraphVersion: partialGraphUpdate ? 2 : undefined,
    changedCodeFiles: changedCodePaths.length,
    deletedCodeFiles: deletedCodePaths.length,
    invalidatedFiles: codeGraphPaths.length,
    reindexedFiles: partialGraphUpdate ? changedCodePaths.length : 0,
    staleEdges: 0,
    fallbackReason: conservativeFullRebuild
      ? `changed code graph paths exceed incremental threshold: ${codeGraphPaths.length} > ${options.batchIncrementalCodeFileLimit}`
      : undefined,
    affectedCallerExpansion: {
      enabled: partialGraphUpdate,
      changedFiles: changedCodePaths.length,
      candidateCallers: 0,
      reindexedCallers: 0,
      skippedCallers: 0,
      staleIncomingEdges: 0,
      reason: partialGraphUpdate ? "pending_partial_graph_update" : "not_applicable"
    },
    freshness: freshnessFor({
      codeGraphStale,
      partialGraphUpdate,
      conservativeFullRebuild,
      codeGraphChanged: codeGraphPaths.length > 0
    }),
    partialVerification:
      (options.verifyPartial || options.compareFull) && partialGraphUpdate
        ? {
            enabled: true,
            passed: !options.compareFull,
            differences: options.compareFull ? ["compare_full_pending"] : [],
            allowedDifferences: ["coChangeGraph: stale_until_full_scan", "duplicateClusters: partial"]
          }
        : undefined
  };
}

function verifyPartialAgainstFull(
  db: ProjectDatabase,
  repoId: number,
  repoRoot: string
): NonNullable<NonNullable<ScanResult["incremental"]>["partialVerification"]> {
  const tempRepo = copyRepoWithoutNavigatorState(repoRoot, "pnav-compare-full-");
  try {
    scanRepo(tempRepo, { mode: "full" });
    const full = graphSnapshot(tempRepo);
    const partial = snapshotProjectDb(db, repoId, repoRoot);
    const result = compareGraphSnapshots("scan_compare_full", partial, full);
    const differences = [
      ...result.hardFailures,
      ...Object.entries(result.graphDiff).map(
        ([section, diff]) =>
          `${section}: missing=${diff?.missingInPartial.length ?? 0} extra=${diff?.extraInPartial.length ?? 0}`
      )
    ];
    return {
      enabled: true,
      passed: result.passed,
      differences,
      allowedDifferences: result.allowedDifferences
    };
  } finally {
    rmSync(tempRepo, { recursive: true, force: true });
  }
}

function copyRepoWithoutNavigatorState(repoRoot: string, prefix: string): string {
  const tempRepo = mkdtempSync(path.join(tmpdir(), prefix));
  cpSync(repoRoot, tempRepo, {
    recursive: true,
    filter: (source) =>
      !source.includes(`${path.sep}.git${path.sep}`) &&
      !source.endsWith(`${path.sep}.git`) &&
      !source.includes(`${path.sep}.pnav${path.sep}`) &&
      !source.endsWith(`${path.sep}.pnav`)
  });
  return tempRepo;
}

function freshnessFor(flags: {
  codeGraphStale: boolean;
  partialGraphUpdate: boolean;
  conservativeFullRebuild: boolean;
  codeGraphChanged: boolean;
}): NonNullable<ScanResult["incremental"]>["freshness"] {
  if (flags.codeGraphStale) {
    return {
      fileCatalog: "fresh",
      symbolGraph: "stale",
      importGraph: "stale",
      routeGraph: "stale",
      testGraph: "stale",
      duplicateClusters: "stale",
      coChangeGraph: "stale_until_full_scan"
    };
  }
  if (flags.partialGraphUpdate) {
    return {
      fileCatalog: "fresh",
      symbolGraph: "fresh",
      importGraph: "fresh",
      routeGraph: "fresh",
      testGraph: "fresh",
      duplicateClusters: "partial",
      coChangeGraph: "stale_until_full_scan"
    };
  }
  return {
    fileCatalog: "fresh",
    symbolGraph: "fresh",
    importGraph: "fresh",
    routeGraph: "fresh",
    testGraph: "fresh",
    duplicateClusters: flags.codeGraphChanged && !flags.conservativeFullRebuild ? "partial" : "fresh",
    coChangeGraph: flags.conservativeFullRebuild || !flags.codeGraphChanged ? "fresh" : "stale_until_full_scan"
  };
}

function buildChangePlanes(changedPaths: string[], deletedPaths: string[]): IncrementalChangePlanes {
  const planes: IncrementalChangePlanes = {
    workflowProfiles: [],
    evalSuites: [],
    commandSources: [],
    docs: [],
    codeGraph: [],
    deleted: [...deletedPaths]
  };
  for (const filePath of [...changedPaths, ...deletedPaths]) {
    if (isWorkflowProfilePath(filePath)) {
      planes.workflowProfiles.push(filePath);
    } else if (isEvalOnlyPath(filePath)) {
      planes.evalSuites.push(filePath);
    } else if (isCommandSourcePath(filePath)) {
      planes.commandSources.push(filePath);
    } else if (isDocsOnlyPath(filePath)) {
      planes.docs.push(filePath);
    } else {
      planes.codeGraph.push(filePath);
    }
  }
  return planes;
}

function countChangePlanes(planes: IncrementalChangePlanes): Record<keyof IncrementalChangePlanes, number> {
  return {
    workflowProfiles: planes.workflowProfiles.length,
    evalSuites: planes.evalSuites.length,
    commandSources: planes.commandSources.length,
    docs: planes.docs.length,
    codeGraph: planes.codeGraph.length,
    deleted: planes.deleted.length
  };
}

function capChangePlanes(planes: IncrementalChangePlanes): IncrementalChangePlanes {
  return {
    workflowProfiles: planes.workflowProfiles.slice(0, 100),
    evalSuites: planes.evalSuites.slice(0, 100),
    commandSources: planes.commandSources.slice(0, 100),
    docs: planes.docs.slice(0, 100),
    codeGraph: planes.codeGraph.slice(0, 100),
    deleted: planes.deleted.slice(0, 100)
  };
}

function classifyIncrementalChange(planes: IncrementalChangePlanes): IncrementalChangeKind {
  const nonEmpty: Array<Exclude<keyof IncrementalChangePlanes, "deleted">> = [];
  if (planes.workflowProfiles.length > 0) nonEmpty.push("workflowProfiles");
  if (planes.evalSuites.length > 0) nonEmpty.push("evalSuites");
  if (planes.commandSources.length > 0) nonEmpty.push("commandSources");
  if (planes.docs.length > 0) nonEmpty.push("docs");
  if (planes.codeGraph.length > 0) nonEmpty.push("codeGraph");
  if (nonEmpty.length === 0) {
    return "none";
  }
  if (nonEmpty.length > 1) {
    return "mixed";
  }
  if (nonEmpty[0] === "workflowProfiles") {
    return "workflow_profiles_only";
  }
  if (nonEmpty[0] === "evalSuites") {
    return "eval_only";
  }
  if (nonEmpty[0] === "commandSources") {
    return "commands_only";
  }
  if (nonEmpty[0] === "docs") {
    return "docs_only";
  }
  return "code_graph";
}

function incrementalActions(
  planes: IncrementalChangePlanes,
  flags: {
    codeGraphStale: boolean;
    conservativeFullRebuild: boolean;
    partialGraphUpdate: boolean;
    batchPartialGraphUpdate: boolean;
    deletedCodeFiles: number;
  }
): string[] {
  const actions: string[] = [];
  if (
    planes.workflowProfiles.length === 0 &&
    planes.evalSuites.length === 0 &&
    planes.commandSources.length === 0 &&
    planes.docs.length === 0 &&
    planes.codeGraph.length === 0 &&
    planes.deleted.length === 0
  ) {
    return ["no_changes"];
  }
  if (planes.workflowProfiles.length > 0) actions.push("refresh_workflow_profiles");
  if (planes.evalSuites.length > 0) actions.push("refresh_eval_suites");
  if (planes.commandSources.length > 0) actions.push("rescan_commands");
  if (planes.docs.length > 0) actions.push("rescan_rules_documents");
  if (flags.codeGraphStale) {
    actions.push("mark_code_graph_stale");
  } else if (flags.partialGraphUpdate) {
    if (flags.batchPartialGraphUpdate) {
      actions.push("batch_partial_graph_update");
    }
    if (flags.deletedCodeFiles > 0) {
      actions.push("invalidate_deleted_source");
    }
    actions.push(
      "update_changed_files",
      "reindex_changed_code_files",
      "expand_affected_callers",
      "rewire_stable_incoming_symbol_edges",
      "recompute_duplicate_clusters"
    );
  } else if (flags.conservativeFullRebuild) {
    actions.push("conservative_rebuild");
  }
  return actions;
}

function isCodeGraphPath(filePath: string): boolean {
  return (
    !isWorkflowProfilePath(filePath) &&
    !isEvalOnlyPath(filePath) &&
    !isCommandSourcePath(filePath) &&
    !isDocsOnlyPath(filePath)
  );
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
