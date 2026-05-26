import { openProject } from "../db/project.js";
import { scoreText } from "../graph/scoring.js";
import type { WhyRelatedResult } from "./types.js";

export function whyRelated(repoPath: string, target: string, task: string): WhyRelatedResult {
  const evidence: WhyRelatedResult["evidence"] = [];
  const pathScore = scoreText(task, target);
  if (pathScore > 0) {
    evidence.push({ type: "path_token", detail: "Target path shares tokens with the task.", score: pathScore });
  }

  const project = openProject(repoPath);
  try {
    const symbols = project.db
      .prepare(
        `SELECT s.name, s.qualified_name AS qualifiedName
         FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ? AND f.path = ?
         ORDER BY s.start_line LIMIT 10`
      )
      .all(project.repo.id, target) as Array<{ name: string; qualifiedName: string | null }>;
    for (const symbol of symbols) {
      const score = scoreText(task, `${symbol.name} ${symbol.qualifiedName ?? ""}`);
      if (score > 0) {
        evidence.push({ type: "symbol_token", detail: symbol.qualifiedName ?? symbol.name, score });
      }
    }

    const route = project.db
      .prepare(
        `SELECT r.path, r.name FROM routes r JOIN files f ON f.id = r.file_id
         WHERE r.repo_id = ? AND f.path = ? LIMIT 1`
      )
      .get(project.repo.id, target) as { path: string; name: string | null } | undefined;
    if (route) {
      evidence.push({ type: "entrypoint", detail: `Route ${route.name ?? route.path}`, score: 0.8 });
    }

    const imports = project.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM edges e JOIN files f ON f.id = e.to_id
         WHERE e.repo_id = ? AND e.kind = 'imports' AND f.path = ?`
      )
      .get(project.repo.id, target) as { count: number };
    if (imports.count > 0) {
      evidence.push({ type: "graph_proximity", detail: `${imports.count} files import this target.`, score: 0.5 });
    }
  } finally {
    project.db.close();
  }

  const score = Math.min(1, evidence.reduce((total, item) => total + (item.score ?? 0.2), 0) / 2);
  return { target, task, score: Number(score.toFixed(2)), evidence };
}
