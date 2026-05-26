import { openProject } from "../db/project.js";
import { clampScore, scoreText } from "./scoring.js";
import type { SymbolHit } from "./types.js";

export function findSymbol(repoPath: string, query: string, limit = 20): SymbolHit[] {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT s.name, s.kind, s.signature, s.qualified_name AS qualifiedName,
                s.start_line AS startLine, s.end_line AS endLine, f.path
         FROM symbols_fts
         JOIN symbols s ON s.id = symbols_fts.rowid
         JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ? AND symbols_fts MATCH ?
         ORDER BY bm25(symbols_fts)
         LIMIT ?`
      )
      .all(project.repo.id, toFtsQuery(query), limit) as Omit<SymbolHit, "score">[];
    if (rows.length > 0) {
      return rows.map((row, index) => ({
        ...row,
        score: clampScore(1 - index / Math.max(1, rows.length))
      }));
    }
    return fallbackFindSymbol(repoPath, query, limit);
  } finally {
    project.db.close();
  }
}

function fallbackFindSymbol(repoPath: string, query: string, limit: number): SymbolHit[] {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT s.name, s.kind, s.signature, s.qualified_name AS qualifiedName,
                s.start_line AS startLine, s.end_line AS endLine, f.path
         FROM symbols s
         JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ?
         ORDER BY s.name
         LIMIT 20000`
      )
      .all(project.repo.id) as Omit<SymbolHit, "score">[];
    return rows
      .map((row) => ({
        ...row,
        score: clampScore(Math.max(scoreText(query, row.name), scoreText(query, row.path) * 0.8))
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, limit);
  } finally {
    project.db.close();
  }
}

function toFtsQuery(query: string): string {
  const terms = query
    .replace(/["']/g, " ")
    .split(/[^A-Za-z0-9_\u4e00-\u9fa5]+/u)
    .filter((term) => term.length > 1)
    .slice(0, 8);
  return terms.length > 0 ? terms.map((term) => `"${term}"`).join(" OR ") : "\"__pnav_no_match__\"";
}
