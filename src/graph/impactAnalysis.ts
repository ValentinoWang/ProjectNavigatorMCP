import { openProject } from "../db/project.js";
import type { ImpactResult } from "./types.js";

interface EdgeRow {
  path: string;
  relationship: string;
  confidence: number;
  weight: number;
}

export function impactAnalysis(repoPath: string, target: string, depth = 2): ImpactResult {
  const project = openProject(repoPath);
  try {
    const file = project.db.prepare("SELECT id, path FROM files WHERE repo_id = ? AND path = ?").get(project.repo.id, target) as { id: number; path: string } | undefined;
    if (!file) {
      return {
        target,
        impactedFiles: [],
        risks: [`Target file was not found in the current index: ${target}`]
      };
    }

    const rows = project.db
      .prepare(
        `SELECT f.path, e.kind AS relationship, e.confidence, e.weight
         FROM edges e
         JOIN files f ON f.id = e.to_id AND e.to_type = 'file'
         WHERE e.repo_id = ? AND e.from_type = 'file' AND e.from_id = ?
         UNION ALL
         SELECT f.path, e.kind AS relationship, e.confidence, e.weight
         FROM edges e
         JOIN files f ON f.id = e.from_id AND e.from_type = 'file'
         WHERE e.repo_id = ? AND e.to_type = 'file' AND e.to_id = ?`
      )
      .all(project.repo.id, file.id, project.repo.id, file.id) as EdgeRow[];

    const impacted = new Map<string, { path: string; relationship: string; confidence: number; score: number }>();
    for (const row of rows) {
      const score = relationshipWeight(row.relationship) * row.confidence * Math.min(3, row.weight);
      const existing = impacted.get(row.path);
      if (!existing || score > existing.score) {
        impacted.set(row.path, {
          path: row.path,
          relationship: row.relationship,
          confidence: row.confidence,
          score
        });
      }
    }

    return {
      target,
      impactedFiles: Array.from(impacted.values()).sort((a, b) => b.score - a.score).slice(0, depth * 20),
      risks: risksForTarget(target)
    };
  } finally {
    project.db.close();
  }
}

function relationshipWeight(kind: string): number {
  if (kind === "covered_by") {
    return 1.0;
  }
  if (kind === "imports") {
    return 0.85;
  }
  if (kind === "co_changes") {
    return 0.7;
  }
  return 0.5;
}

function risksForTarget(target: string): string[] {
  const risks: string[] = [];
  if (/frontend\/|\.dart$/.test(target)) {
    risks.push("Frontend changes may require Flutter analyze, widget tests, and responsive layout checks.");
  }
  if (/backend\/app\/api|schema|openapi|api_client/.test(target)) {
    risks.push("API contract changes may require OpenAPI refresh, SDK generation, and drift guards.");
  }
  if (/auth|identity|login/.test(target)) {
    risks.push("Auth and identity changes may differ across athlete, coach, admin, and personal workspace paths.");
  }
  if (risks.length === 0) {
    risks.push("Review direct imports, related tests, and Git co-change neighbors before editing.");
  }
  return risks;
}

