import { findRelatedFiles } from "./relatedFiles.js";
import { relatedTests } from "./relatedTests.js";
import { findEntrypoints } from "../discovery/entrypoints.js";
import { findReusableComponents } from "../discovery/reuse.js";
import { findCallers, findCallees } from "../discovery/symbolGraph.js";

export function impactAnalysisV2(
  repoPath: string,
  query: string,
  options: { includeTests?: boolean; includeEntrypoints?: boolean; includeReuseRisks?: boolean } = {}
) {
  const related = findRelatedFiles(repoPath, query, 20).files;
  const callers = findCallers(repoPath, query, 20).callers;
  const callees = findCallees(repoPath, query, 20).callees;
  return {
    target: query,
    callers,
    callees,
    impactedFiles: related,
    affectedEntrypoints: options.includeEntrypoints === false ? [] : findEntrypoints(repoPath, query, 10).entrypoints,
    relatedTests:
      options.includeTests === false
        ? { commands: [], testFiles: [] }
        : relatedTests(
            repoPath,
            related.map((file) => file.path),
            query
          ),
    reuseRisks: options.includeReuseRisks === false ? [] : findReusableComponents(repoPath, query, 8).duplicateRisks,
    risks: [
      "Review direct callers/callees before editing.",
      "Check affected entrypoints and related tests.",
      "Inspect reuse risks before duplicating implementation."
    ]
  };
}
