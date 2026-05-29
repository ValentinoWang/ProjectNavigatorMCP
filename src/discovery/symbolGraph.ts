import { openProject } from "../db/project.js";
import { resolveSymbol } from "./symbolResolver.js";
import type { SymbolTraceHit } from "./types.js";

export function findCallers(
  repoPath: string,
  query: string,
  limit = 20
): { symbol: string; callers: SymbolTraceHit[] } {
  const target = resolveSymbol(repoPath, query);
  if (!target) {
    return { symbol: query, callers: [] };
  }
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT s.name, s.qualified_name AS qualifiedName, s.kind, f.path,
                s.start_line AS startLine, s.end_line AS endLine, e.confidence, e.evidence_json AS evidenceJson
         FROM symbol_edges e
         JOIN symbols s ON s.id = e.from_symbol_id
         JOIN files f ON f.id = s.file_id
         WHERE e.repo_id = ? AND e.to_symbol_id = ?
         ORDER BY e.confidence DESC, f.path
         LIMIT ?`
      )
      .all(project.repo.id, target.id, limit) as GraphRow[];
    return { symbol: target.qualifiedName ?? target.name, callers: rows.map(toTraceHit) };
  } finally {
    project.db.close();
  }
}

export function findCallees(
  repoPath: string,
  query: string,
  limit = 20
): { symbol: string; callees: SymbolTraceHit[] } {
  const target = resolveSymbol(repoPath, query);
  if (!target) {
    return { symbol: query, callees: [] };
  }
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT s.name, s.qualified_name AS qualifiedName, s.kind, f.path,
                s.start_line AS startLine, s.end_line AS endLine, e.confidence, e.evidence_json AS evidenceJson
         FROM symbol_edges e
         JOIN symbols s ON s.id = e.to_symbol_id
         JOIN files f ON f.id = s.file_id
         WHERE e.repo_id = ? AND e.from_symbol_id = ?
         ORDER BY e.confidence DESC, f.path
         LIMIT ?`
      )
      .all(project.repo.id, target.id, limit) as GraphRow[];
    return { symbol: target.qualifiedName ?? target.name, callees: rows.map(toTraceHit) };
  } finally {
    project.db.close();
  }
}

export function traceSymbol(
  repoPath: string,
  query: string
): {
  symbol: string;
  callers: SymbolTraceHit[];
  callees: SymbolTraceHit[];
} {
  const callers = findCallers(repoPath, query, 12);
  const callees = findCallees(repoPath, query, 12);
  return { symbol: callers.symbol, callers: callers.callers, callees: callees.callees };
}

interface GraphRow {
  name: string;
  qualifiedName: string | null;
  kind: string;
  path: string;
  startLine: number;
  endLine: number;
  confidence: number;
  evidenceJson: string;
}

function toTraceHit(row: GraphRow): SymbolTraceHit {
  const evidence = safeArray(row.evidenceJson).map((detail) => ({
    type: "symbol_edge",
    detail,
    freshness: "fresh" as const
  }));
  return {
    symbol: row.name,
    qualifiedName: row.qualifiedName,
    kind: row.kind,
    path: row.path,
    startLine: row.startLine,
    endLine: row.endLine,
    confidence: row.confidence,
    why: evidence.length > 0 ? evidence.map((item) => item.detail).join(", ") : "Symbol graph edge.",
    evidence
  };
}

function safeArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
