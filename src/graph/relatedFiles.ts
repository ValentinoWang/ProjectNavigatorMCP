import { loadProjectConfig, matchesAnyPattern, type ProjectConfig } from "../config/projectConfig.js";
import { openProject } from "../db/project.js";
import type { ProjectDatabase } from "../db/connection.js";
import { clampScore, scoreText, tokenize } from "./scoring.js";
import type { FileHit, RelatedFilesResult } from "./types.js";

interface FileRow {
  id: number;
  path: string;
  language: string;
}

export function findRelatedFiles(repoPath: string, task: string, limit = 20): RelatedFilesResult {
  const project = openProject(repoPath);
  try {
    const config = loadProjectConfig(repoPath);
    const rows = project.db
      .prepare("SELECT id, path, language FROM files WHERE repo_id = ? ORDER BY path")
      .all(project.repo.id) as FileRow[];
    const tokenSet = new Set(tokenize(task));
    const scored = new Map<number, FileHit>();

    for (const file of rows) {
      const pathScore = scoreText(task, file.path);
      const domainBoost = domainScore(task, file.path, config);
      const score = clampScore(pathScore * 0.65 + domainBoost + sourcePathBoost(file.path, config));
      if (score > 0) {
        scored.set(file.id, {
          path: file.path,
          language: file.language,
          score,
          reason: reasonFor(file.path, pathScore, domainBoost)
        });
      }
    }

    const symbolRows = project.db
      .prepare(
        `SELECT f.id AS fileId, f.path, f.language, s.name
         FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ?`
      )
      .all(project.repo.id) as Array<{ fileId: number; path: string; language: string; name: string }>;
    for (const row of symbolRows) {
      const symbolScore = scoreText(task, row.name);
      if (symbolScore <= 0) {
        continue;
      }
      mergeHit(scored, row.fileId, {
        path: row.path,
        language: row.language,
        score: clampScore(symbolScore * 0.75),
        reason: `Symbol match: ${row.name}`
      });
    }

    for (const token of tokenSet) {
      addCommandRelatedFiles(project.db, project.repo.id, scored, token);
    }

    return {
      files: Array.from(scored.values())
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, limit)
    };
  } finally {
    project.db.close();
  }
}

function addCommandRelatedFiles(
  db: ProjectDatabase,
  repoId: number,
  scored: Map<number, FileHit>,
  token: string
): void {
  const rows = db
    .prepare("SELECT id, path, language FROM files WHERE repo_id = ? AND path LIKE ? LIMIT 50")
    .all(repoId, `%${token}%`) as FileRow[];
  for (const row of rows) {
    mergeHit(scored, row.id, {
      path: row.path,
      language: row.language,
      score: 0.35,
      reason: `Path contains task token: ${token}`
    });
  }
}

function mergeHit(scored: Map<number, FileHit>, fileId: number, hit: FileHit): void {
  const existing = scored.get(fileId);
  if (!existing || hit.score > existing.score) {
    scored.set(fileId, hit);
  }
}

function domainScore(task: string, filePath: string, config: ProjectConfig): number {
  const loweredTask = task.toLowerCase();
  let score = 0;
  for (const domain of config.domains) {
    const taskMatches = domain.keywords.some((keyword) => loweredTask.includes(keyword.toLowerCase()));
    if (!taskMatches) {
      continue;
    }
    const pathMatches =
      matchesAnyPattern(filePath, domain.paths) ||
      domain.keywords.some((keyword) => filePath.toLowerCase().includes(keyword.toLowerCase()));
    if (pathMatches) {
      score += 0.35;
    }
  }
  return score;
}

function sourcePathBoost(filePath: string, config: ProjectConfig): number {
  return config.sourcePathBoosts
    .filter((item) => matchesAnyPattern(filePath, [item.pattern]))
    .reduce((total, item) => total + item.boost, 0);
}

function reasonFor(path: string, pathScore: number, domainBoost: number): string {
  if (domainBoost > 0 && pathScore > 0) {
    return "Path and domain keywords match the task.";
  }
  if (domainBoost > 0) {
    return "Domain-specific heuristic match.";
  }
  return "Path tokens match the task.";
}
