import { findRelatedFiles } from "../graph/relatedFiles.js";
import { relatedTests } from "../graph/relatedTests.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { discoveryReadScore, tierReadOrder } from "./discoveryQuality.js";
import { findEntrypoints } from "./entrypoints.js";
import { findReusableComponents } from "./reuse.js";
import { findCallees } from "./symbolGraph.js";
import type { DiscoveryResult } from "./types.js";
import { whyRelated } from "./whyRelated.js";

export function discoverCode(repoPath: string, task: string, limit = 15): DiscoveryResult {
  const entrypoints = findEntrypoints(repoPath, task, 10).entrypoints;
  const related = findRelatedFiles(repoPath, task, limit).files;
  const coreSymbols = findSymbol(repoPath, task, 12);
  const reuse = findReusableComponents(repoPath, task, 8);
  const tests = relatedTests(
    repoPath,
    [...entrypoints.slice(0, 5).map((entry) => entry.path), ...related.slice(0, 8).map((file) => file.path)],
    task
  );
  const callGraphPreview = coreSymbols.slice(0, 5).flatMap((symbol) =>
    findCallees(repoPath, symbol.qualifiedName ?? symbol.name, 5).callees.map((callee) => ({
      from: symbol.qualifiedName ?? symbol.name,
      to: callee.qualifiedName ?? callee.symbol,
      kind: "calls",
      confidence: callee.confidence,
      evidence: callee.evidence
    }))
  );
  const recommendedReadOrder = rankReadOrder(task, entrypoints, related, reuse.reuseCandidates);
  const tiers = tierReadOrder(task, recommendedReadOrder, limit);

  return {
    mode: "discovery",
    task,
    entrypoints,
    coreSymbols,
    callGraphPreview,
    reuseCandidates: reuse.reuseCandidates,
    duplicateRisks: reuse.duplicateRisks,
    impactPreview: related.slice(0, 10),
    recommendedReadOrder,
    mustRead: tiers.mustRead,
    shouldInspect: tiers.shouldInspect,
    reuseBeforeCreate: reuse.reuseCandidates.filter((hit) => hit.verdict !== "create_new_allowed"),
    ignoreForNow: tiers.ignoreForNow,
    whyRelated: recommendedReadOrder.slice(0, 8).map((file) => whyRelated(repoPath, file.path, task)),
    relatedTests: tests,
    warnings: []
  };
}

function rankReadOrder(
  task: string,
  entrypoints: DiscoveryResult["entrypoints"],
  related: DiscoveryResult["recommendedReadOrder"],
  reuseCandidates: DiscoveryResult["reuseCandidates"]
) {
  const fromEntrypoints = entrypoints.map((entry) => ({
    path: entry.path,
    score: discoveryReadScore(task, entry.path, entry.score),
    reason: entry.why,
    language: undefined
  }));
  const fromReuse = reuseCandidates.map((hit) => ({
    path: hit.path,
    score: discoveryReadScore(task, hit.path, Math.max(0.55, hit.similarity)),
    reason: `${hit.verdict ?? "reuse_candidate"}: ${hit.why}`,
    language: undefined
  }));
  const best = new Map<string, (typeof related)[number]>();
  for (const item of [...fromEntrypoints, ...fromReuse, ...related]) {
    const normalized = { ...item, score: discoveryReadScore(task, item.path, item.score) };
    const existing = best.get(normalized.path);
    if (!existing || normalized.score > existing.score) {
      best.set(normalized.path, normalized);
    }
  }
  return Array.from(best.values())
    .filter((item) => item.path)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 15);
}
