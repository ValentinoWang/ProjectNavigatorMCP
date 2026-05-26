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
    const rows = project.db
      .prepare("SELECT id, path, language FROM files WHERE repo_id = ? ORDER BY path")
      .all(project.repo.id) as FileRow[];
    const tokenSet = new Set(tokenize(task));
    const scored = new Map<number, FileHit>();

    for (const file of rows) {
      const pathScore = scoreText(task, file.path);
      const domainBoost = domainScore(task, file.path);
      const score = clampScore(pathScore * 0.65 + domainBoost + sourcePathBoost(file.path));
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

function domainScore(task: string, filePath: string): number {
  const loweredTask = task.toLowerCase();
  const loweredPath = filePath.toLowerCase();
  let score = 0;
  if (/登录|auth|identity|身份/.test(loweredTask) && /auth|identity|login/.test(loweredPath)) {
    score += 0.35;
  }
  if (/登录|auth|identity|身份/.test(loweredTask) && /frontend\/lib\/core\/identity|frontend\/lib\/core\/di|frontend\/lib\/modules\/auth/.test(loweredPath)) {
    score += 0.22;
  }
  if (/workspace|microplan|滚动|scroll|sliver/.test(loweredTask) && /workspace|microplan|scroll|sliver/.test(loweredPath)) {
    score += 0.35;
  }
  if (/session plan|session_plan|接口|api|字段|contract|openapi/.test(loweredTask) && /session[_-]?plan|api|schema|openapi|client/.test(loweredPath)) {
    score += 0.35;
  }
  if (/test|测试|guard|验收/.test(loweredTask) && /test|tests|guard/.test(loweredPath)) {
    score += 0.25;
  }
  return score;
}

function sourcePathBoost(filePath: string): number {
  if (/^(frontend\/lib|backend\/app|backend\/repositories|shared\/api)\//.test(filePath)) {
    return 0.18;
  }
  if (/^(frontend\/test|backend\/tests|tests)\//.test(filePath)) {
    return 0.08;
  }
  return 0;
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
