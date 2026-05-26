import { openProject } from "../db/project.js";
import { scoreText } from "./scoring.js";
import type { RouteHit } from "./types.js";

export function traceRoute(repoPath: string, query: string, limit = 20): RouteHit[] {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT r.framework, r.method, r.path, r.name, f.path AS routeFile, s.name AS targetSymbol
         FROM routes r
         LEFT JOIN files f ON f.id = r.file_id
         LEFT JOIN symbols s ON s.id = r.symbol_id
         WHERE r.repo_id = ?`
      )
      .all(project.repo.id) as RouteHit[];
    return rows
      .map((row) => ({
        ...row,
        score: Math.max(
          scoreText(query, row.path),
          scoreText(query, row.name ?? ""),
          scoreText(query, row.routeFile ?? "")
        )
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score: _score, ...row }) => row);
  } finally {
    project.db.close();
  }
}
