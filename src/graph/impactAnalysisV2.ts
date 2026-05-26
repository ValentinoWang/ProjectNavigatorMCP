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
  const affectedEntrypoints =
    options.includeEntrypoints === false ? [] : findEntrypoints(repoPath, query, 10).entrypoints;
  const testImpact =
    options.includeTests === false
      ? { commands: [], testFiles: [] }
      : relatedTests(
          repoPath,
          related.map((file) => file.path),
          query
        );
  const reuseImpact =
    options.includeReuseRisks === false ? [] : findReusableComponents(repoPath, query, 8).duplicateRisks;
  return {
    target: query,
    directCallers: callers,
    directCallees: callees,
    callers,
    callees,
    entrypointImpact: affectedEntrypoints,
    testImpact,
    reuseImpact,
    cochangeImpact: related.filter((file) => /co.?change/i.test(file.reason)).slice(0, 10),
    riskSummary: [
      callers.length > 0 ? "Direct callers exist; review before editing." : "No direct callers found in symbol graph.",
      affectedEntrypoints.length > 0 ? "Target appears near entrypoint chains." : "No affected entrypoint found.",
      reuseImpact.length > 0
        ? "Similar implementations may need reuse or synchronized changes."
        : "No strong reuse risk found.",
      testImpact.testFiles.length > 0 ? "Related tests found." : "No related tests found."
    ],
    impactedFiles: related,
    affectedEntrypoints,
    relatedTests: testImpact,
    reuseRisks: reuseImpact,
    risks: [
      "Review direct callers/callees before editing.",
      "Check affected entrypoints and related tests.",
      "Inspect reuse risks before duplicating implementation."
    ]
  };
}
