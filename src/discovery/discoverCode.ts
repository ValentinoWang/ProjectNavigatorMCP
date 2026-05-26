import { findRelatedFiles } from "../graph/relatedFiles.js";
import { relatedTests } from "../graph/relatedTests.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { findEntrypoints } from "./entrypoints.js";
import { findReusableComponents } from "./reuse.js";
import { findCallees } from "./symbolGraph.js";
import { whyRelated } from "./whyRelated.js";
import type { DiscoveryResult } from "./types.js";

export function discoverCode(repoPath: string, task: string, limit = 15): DiscoveryResult {
  const entrypoints = findEntrypoints(repoPath, task, 8).entrypoints;
  const related = findRelatedFiles(repoPath, task, limit).files;
  const coreSymbols = findSymbol(repoPath, task, 12);
  const reuse = findReusableComponents(repoPath, task, 8);
  const tests = relatedTests(
    repoPath,
    related.slice(0, 8).map((file) => file.path),
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

  return {
    mode: "discovery",
    task,
    entrypoints,
    coreSymbols,
    callGraphPreview,
    reuseCandidates: reuse.reuseCandidates,
    duplicateRisks: reuse.duplicateRisks,
    impactPreview: related.slice(0, 10),
    recommendedReadOrder: rankReadOrder(task, entrypoints, related, reuse.reuseCandidates),
    whyRelated: related.slice(0, 8).map((file) => whyRelated(repoPath, file.path, task)),
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
    score: Math.min(0.9, entry.score),
    reason: entry.why,
    language: undefined
  }));
  const fromReuse = reuseCandidates.map((hit) => ({
    path: hit.path,
    score: adjustedReadScore(task, hit.path, Math.max(0.92, hit.similarity)),
    reason: `Reuse candidate: ${hit.why}`,
    language: undefined
  }));
  const best = new Map<string, (typeof related)[number]>();
  for (const item of [...fromReuse, ...fromEntrypoints, ...related]) {
    item.score = adjustedReadScore(task, item.path, item.score);
    const existing = best.get(item.path);
    if (!existing || item.score > existing.score) {
      best.set(item.path, item);
    }
  }
  return Array.from(best.values())
    .filter((item) => item.path)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 15);
}

function adjustedReadScore(task: string, filePath: string, score: number): number {
  const lowered = task.toLowerCase();
  const frontendIntent = /页面|界面|组件|卡片|widget|flutter|frontend|dashboard|card|ui/.test(lowered);
  const apiIntent = /api|接口|endpoint|schema|字段|backend|fastapi/.test(lowered);
  let adjusted = score;
  if (frontendIntent && filePath.startsWith("backend/") && !apiIntent) {
    adjusted -= 0.45;
  }
  if (frontendIntent && /(^|\/)(test|tests)\//.test(filePath)) {
    adjusted -= 0.25;
  }
  if (frontendIntent && filePath.startsWith("frontend/lib/")) {
    adjusted += 0.08;
  }
  if (frontendIntent && /\bdashboard\b/.test(lowered) && filePath.includes("user_core/dashboard")) {
    adjusted += 0.12;
  }
  return Number(Math.max(0, Math.min(1, adjusted)).toFixed(3));
}
