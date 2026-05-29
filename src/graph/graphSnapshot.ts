import { writeFileSync } from "node:fs";
import { openProject } from "../db/project.js";
import type { ProjectDatabase } from "../db/connection.js";
import type { GraphFreshness } from "../scanner/types.js";

export interface GraphSnapshot {
  repoRoot: string;
  generatedAt: string;
  files: SnapshotFile[];
  symbols: SnapshotSymbol[];
  importBindings: SnapshotImportBinding[];
  routes: SnapshotRoute[];
  tests: SnapshotTest[];
  codeBlocks: SnapshotCodeBlock[];
  symbolEdges: SnapshotSymbolEdge[];
  freshness: GraphFreshness;
  counts: Record<GraphSnapshotSection, number>;
}

export type GraphSnapshotSection =
  | "files"
  | "symbols"
  | "importBindings"
  | "routes"
  | "tests"
  | "codeBlocks"
  | "symbolEdges";

export interface SnapshotFile {
  path: string;
  language: string;
  hash: string | null;
  deleted: boolean;
}

export interface SnapshotSymbol {
  key: string;
  path: string;
  name: string;
  kind: string;
  qualifiedName: string | null;
  startLine: number;
  endLine: number;
}

export interface SnapshotImportBinding {
  key: string;
  path: string;
  sourceText: string;
  importedName: string | null;
  localName: string | null;
  resolvedPath: string | null;
  confidence: number;
}

export interface SnapshotRoute {
  key: string;
  framework: string;
  method: string | null;
  path: string;
  name: string | null;
  filePath: string | null;
  symbolName: string | null;
}

export interface SnapshotTest {
  key: string;
  testFile: string;
  targetFile: string | null;
  command: string | null;
  confidence: number;
}

export interface SnapshotCodeBlock {
  key: string;
  path: string;
  name: string | null;
  kind: string;
  normalizedHash: string | null;
  fingerprint: string | null;
}

export interface SnapshotSymbolEdge {
  key: string;
  from: string;
  to: string;
  kind: string;
  confidenceBucket: string;
}

export function graphSnapshot(repoPath: string): GraphSnapshot {
  const project = openProject(repoPath);
  try {
    return snapshotProjectDb(project.db, project.repo.id, project.repoRoot);
  } finally {
    project.db.close();
  }
}

export function writeGraphSnapshot(repoPath: string, outPath: string): GraphSnapshot {
  const snapshot = graphSnapshot(repoPath);
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

export function snapshotProjectDb(db: ProjectDatabase, repoId: number, repoRoot: string): GraphSnapshot {
  const files = snapshotFiles(db, repoId);
  const symbols = snapshotSymbols(db, repoId);
  const importBindings = snapshotImportBindings(db, repoId);
  const routes = snapshotRoutes(db, repoId);
  const tests = snapshotTests(db, repoId);
  const codeBlocks = snapshotCodeBlocks(db, repoId);
  const symbolEdges = snapshotSymbolEdges(db, repoId);
  return {
    repoRoot,
    generatedAt: new Date().toISOString(),
    files,
    symbols,
    importBindings,
    routes,
    tests,
    codeBlocks,
    symbolEdges,
    freshness: fullFreshness(),
    counts: {
      files: files.length,
      symbols: symbols.length,
      importBindings: importBindings.length,
      routes: routes.length,
      tests: tests.length,
      codeBlocks: codeBlocks.length,
      symbolEdges: symbolEdges.length
    }
  };
}

function snapshotFiles(db: ProjectDatabase, repoId: number): SnapshotFile[] {
  return (
    db
      .prepare(
        `SELECT path, language, hash, deleted_at AS deletedAt
         FROM files
         WHERE repo_id = ?
           AND deleted_at IS NULL
         ORDER BY path`
      )
      .all(repoId) as Array<{ path: string; language: string; hash: string | null; deletedAt: string | null }>
  ).map((row) => ({
    path: row.path,
    language: row.language,
    hash: row.hash,
    deleted: Boolean(row.deletedAt)
  }));
}

function snapshotSymbols(db: ProjectDatabase, repoId: number): SnapshotSymbol[] {
  return (
    db
      .prepare(
        `SELECT f.path, s.name, s.kind, s.qualified_name AS qualifiedName,
                s.start_line AS startLine, s.end_line AS endLine
         FROM symbols s
         JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ?
           AND f.deleted_at IS NULL
         ORDER BY f.path, s.start_line, s.name, s.kind`
      )
      .all(repoId) as Array<{
      path: string;
      name: string;
      kind: string;
      qualifiedName: string | null;
      startLine: number;
      endLine: number;
    }>
  ).map((row) => ({
    key: symbolKey(row.path, row.qualifiedName, row.name, row.kind, row.startLine),
    path: row.path,
    name: row.name,
    kind: row.kind,
    qualifiedName: row.qualifiedName,
    startLine: row.startLine,
    endLine: row.endLine
  }));
}

function snapshotImportBindings(db: ProjectDatabase, repoId: number): SnapshotImportBinding[] {
  return (
    db
      .prepare(
        `SELECT f.path, b.imported_name AS importedName, b.local_name AS localName,
                b.source_text AS sourceText, target.path AS resolvedPath, b.confidence
         FROM import_bindings b
         JOIN files f ON f.id = b.file_id
         LEFT JOIN files target ON target.id = b.resolved_file_id
         WHERE b.repo_id = ?
           AND f.deleted_at IS NULL
         ORDER BY f.path, b.source_text, b.imported_name, b.local_name, target.path`
      )
      .all(repoId) as Array<{
      path: string;
      importedName: string | null;
      localName: string | null;
      sourceText: string;
      resolvedPath: string | null;
      confidence: number;
    }>
  ).map((row) => ({
    key: [row.path, row.sourceText, row.importedName ?? "", row.localName ?? "", row.resolvedPath ?? ""].join("::"),
    ...row
  }));
}

function snapshotRoutes(db: ProjectDatabase, repoId: number): SnapshotRoute[] {
  return (
    db
      .prepare(
        `SELECT r.framework, r.method, r.path, r.name, f.path AS filePath, s.name AS symbolName
         FROM routes r
         LEFT JOIN files f ON f.id = r.file_id
         LEFT JOIN symbols s ON s.id = r.symbol_id
         WHERE r.repo_id = ?
           AND (f.id IS NULL OR f.deleted_at IS NULL)
         ORDER BY r.framework, r.path, r.name, f.path`
      )
      .all(repoId) as Array<{
      framework: string;
      method: string | null;
      path: string;
      name: string | null;
      filePath: string | null;
      symbolName: string | null;
    }>
  ).map((row) => ({
    key: [row.framework, row.method ?? "", row.path, row.name ?? "", row.filePath ?? "", row.symbolName ?? ""].join(
      "::"
    ),
    ...row
  }));
}

function snapshotTests(db: ProjectDatabase, repoId: number): SnapshotTest[] {
  return (
    db
      .prepare(
        `SELECT test.path AS testFile, target.path AS targetFile, t.command, t.confidence
         FROM tests t
         JOIN files test ON test.id = t.test_file_id
         LEFT JOIN files target ON target.id = t.target_file_id
         WHERE t.repo_id = ?
           AND test.deleted_at IS NULL
           AND (target.id IS NULL OR target.deleted_at IS NULL)
         ORDER BY test.path, target.path, t.command`
      )
      .all(repoId) as Array<{ testFile: string; targetFile: string | null; command: string | null; confidence: number }>
  ).map((row) => ({
    key: [row.testFile, row.targetFile ?? "", row.command ?? ""].join("::"),
    ...row
  }));
}

function snapshotCodeBlocks(db: ProjectDatabase, repoId: number): SnapshotCodeBlock[] {
  return (
    db
      .prepare(
        `SELECT path, name, kind, normalized_hash AS normalizedHash, fingerprint
         FROM code_blocks
         WHERE repo_id = ?
         ORDER BY path, name, kind, normalized_hash`
      )
      .all(repoId) as Array<{
      path: string;
      name: string | null;
      kind: string;
      normalizedHash: string | null;
      fingerprint: string | null;
    }>
  ).map((row) => ({
    key: [row.path, row.name ?? "", row.kind, row.normalizedHash ?? "", row.fingerprint ?? ""].join("::"),
    ...row
  }));
}

function snapshotSymbolEdges(db: ProjectDatabase, repoId: number): SnapshotSymbolEdge[] {
  return (
    db
      .prepare(
        `SELECT from_file.path AS fromPath, from_symbol.name AS fromName,
                from_symbol.qualified_name AS fromQualifiedName, from_symbol.kind AS fromKind,
                to_file.path AS toPath, to_symbol.name AS toName,
                to_symbol.qualified_name AS toQualifiedName, to_symbol.kind AS toKind,
                e.kind, e.confidence
         FROM symbol_edges e
         JOIN symbols from_symbol ON from_symbol.id = e.from_symbol_id
         JOIN files from_file ON from_file.id = from_symbol.file_id
         JOIN symbols to_symbol ON to_symbol.id = e.to_symbol_id
         JOIN files to_file ON to_file.id = to_symbol.file_id
         WHERE e.repo_id = ?
         ORDER BY from_file.path, from_symbol.name, to_file.path, to_symbol.name, e.kind`
      )
      .all(repoId) as Array<{
      fromPath: string;
      fromName: string;
      fromQualifiedName: string | null;
      fromKind: string;
      toPath: string;
      toName: string;
      toQualifiedName: string | null;
      toKind: string;
      kind: string;
      confidence: number;
    }>
  ).map((row) => {
    const from = symbolKey(row.fromPath, row.fromQualifiedName, row.fromName, row.fromKind);
    const to = symbolKey(row.toPath, row.toQualifiedName, row.toName, row.toKind);
    return {
      key: [from, row.kind, to, confidenceBucket(row.confidence)].join("::"),
      from,
      to,
      kind: row.kind,
      confidenceBucket: confidenceBucket(row.confidence)
    };
  });
}

function symbolKey(path: string, qualifiedName: string | null, name: string, kind: string, line?: number): string {
  return [path, qualifiedName ?? name, kind, line ?? ""].join("::");
}

function confidenceBucket(confidence: number): string {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

function fullFreshness(): GraphFreshness {
  return {
    fileCatalog: "fresh",
    symbolGraph: "fresh",
    importGraph: "fresh",
    routeGraph: "fresh",
    testGraph: "fresh",
    duplicateClusters: "fresh",
    coChangeGraph: "fresh"
  };
}
