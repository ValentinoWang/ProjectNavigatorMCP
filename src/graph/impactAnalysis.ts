import { openProject } from "../db/project.js";
import type { ImpactResult } from "./types.js";
import { traverseGraph, type TraversalDirection } from "./traversal.js";

export function impactAnalysis(
  repoPath: string,
  target: string,
  depth = 2,
  direction: TraversalDirection = "both"
): ImpactResult {
  const project = openProject(repoPath);
  try {
    const file = project.db
      .prepare("SELECT id, path FROM files WHERE repo_id = ? AND path = ?")
      .get(project.repo.id, target) as { id: number; path: string } | undefined;
    if (!file) {
      return {
        target,
        impactedFiles: [],
        risks: [`Target file was not found in the current index: ${target}`]
      };
    }

    const hits = traverseGraph(project.db, project.repo.id, {
      seedType: "file",
      seedId: file.id,
      direction,
      maxDepth: depth,
      maxResults: depth * 30
    }).filter((hit) => hit.nodeType === "file" && hit.path && hit.path !== target);

    return {
      target,
      impactedFiles: hits.map((hit) => ({
        path: hit.path ?? "",
        relationship: hit.relationshipPath.at(-1)?.kind ?? "related",
        confidence: hit.confidence,
        score: hit.score,
        distance: hit.distance,
        pathChain: hit.relationshipPath.map((step) => `${step.from} --${step.kind}--> ${step.to}`)
      })),
      risks: risksForTarget(target)
    };
  } finally {
    project.db.close();
  }
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
