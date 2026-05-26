import { duplicateClusters } from "./duplicateClusters.js";
import { findReusableComponents } from "./reuse.js";

export function explainReuse(repoPath: string, task: string, limit = 5) {
  const reuse = findReusableComponents(repoPath, task, limit);
  const clusters = duplicateClusters(repoPath, "", limit).clusters.filter((cluster) =>
    cluster.members.some((member) =>
      reuse.reuseCandidates.some(
        (candidate) => candidate.path === member.path || candidate.qualifiedName === member.qualifiedName
      )
    )
  );
  return {
    task,
    reuseCandidates: reuse.reuseCandidates,
    duplicateRisks: reuse.duplicateRisks,
    clusters,
    recommendation:
      reuse.reuseCandidates.length > 0
        ? "Inspect the top reuse candidates before creating new code. Prefer extraction when a duplicate cluster overlaps the target module."
        : "No strong reuse candidate found; proceed with normal discovery."
  };
}
