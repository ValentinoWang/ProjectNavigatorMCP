import { openProject } from "../db/project.js";
import { clampScore, scoreText } from "./scoring.js";
import type { SymbolHit } from "./types.js";

export function findSymbol(repoPath: string, query: string, limit = 20): SymbolHit[] {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT s.name, s.kind, s.start_line AS startLine, s.end_line AS endLine, f.path
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

