import { findRelatedFiles } from "../graph/relatedFiles.js";
import { relatedTests } from "../graph/relatedTests.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { buildAuthoritativeHandoff } from "./authoritativeChain.js";
import { discoveryReadScore, tierReadOrder } from "./discoveryQuality.js";
import { findEntrypoints } from "./entrypoints.js";
import { findReusableComponents } from "./reuse.js";
import { findCallees } from "./symbolGraph.js";
import type { DiscoveryResult, DiscoveryTimingBreakdown } from "./types.js";
import { whyRelated } from "./whyRelated.js";
import {
  isWorkflowProfileReadOrder,
  resolveWorkflowDiscoveryProfiles,
  workflowSuppressesPath,
  type WorkflowDiscoveryProfile
} from "./workflowProfiles.js";

export interface TimedDiscoveryResult {
  result: DiscoveryResult;
  timing: DiscoveryTimingBreakdown;
}

export function discoverCode(repoPath: string, task: string, limit = 15): DiscoveryResult {
  return discoverCodeWithTiming(repoPath, task, limit).result;
}

export function discoverCodeWithTiming(repoPath: string, task: string, limit = 15): TimedDiscoveryResult {
  const startedAt = Date.now();
  const timing = emptyTiming();
  const workflowProfiles = timed(timing, "workflowProfilesMs", () => resolveWorkflowDiscoveryProfiles(repoPath, task));
  const hasWorkflowProfile = workflowProfiles.length > 0;
  const entrypoints = timed(timing, "entrypointsMs", () => findEntrypoints(repoPath, task, 10).entrypoints);
  const related = timed(
    timing,
    "relatedFilesMs",
    () => findRelatedFiles(repoPath, task, hasWorkflowProfile ? Math.min(5, limit) : limit).files
  );
  const coreSymbols = timed(timing, "symbolsMs", () => (hasWorkflowProfile ? [] : findSymbol(repoPath, task, 12)));
  const reuse = timed(timing, "reuseMs", () =>
    hasWorkflowProfile ? { reuseCandidates: [], duplicateRisks: [] } : findReusableComponents(repoPath, task, 8)
  );
  const tests = timed(timing, "relatedTestsMs", () =>
    relatedTests(
      repoPath,
      [...entrypoints.slice(0, 5).map((entry) => entry.path), ...related.slice(0, 8).map((file) => file.path)],
      task,
      {
        relatedFiles: related,
        demoteCommands: workflowProfiles.some((profile) => profile.recommendedCommands.length > 0),
        excludeCommands: workflowProfiles.flatMap((profile) =>
          profile.recommendedCommands.map((command) => command.command)
        )
      }
    )
  );
  const callGraphPreview = timed(timing, "callGraphMs", () =>
    hasWorkflowProfile
      ? []
      : coreSymbols.slice(0, 5).flatMap((symbol) =>
          findCallees(repoPath, symbol.qualifiedName ?? symbol.name, 5).callees.map((callee) => ({
            from: symbol.qualifiedName ?? symbol.name,
            to: callee.qualifiedName ?? callee.symbol,
            kind: "calls",
            confidence: callee.confidence,
            evidence: callee.evidence
          }))
        )
  );
  const recommendedReadOrder = timed(timing, "readOrderMs", () =>
    rankReadOrder(task, entrypoints, related, reuse.reuseCandidates, workflowProfiles)
  );
  const tiers = tierReadOrder(task, recommendedReadOrder, limit);
  const authoritativeHandoff = timed(timing, "handoffMs", () =>
    buildAuthoritativeHandoff(repoPath, task, recommendedReadOrder, reuse.reuseCandidates, tests, workflowProfiles)
  );
  const workflowWarnings = workflowProfiles.flatMap((profile) => profile.warnings);
  const whyRelatedItems = timed(timing, "whyRelatedMs", () =>
    hasWorkflowProfile
      ? recommendedReadOrder.slice(0, 8).map((file) => ({
          target: file.path,
          task,
          score: file.score,
          evidence: [{ type: "workflow_profile", detail: file.reason, score: file.score }]
        }))
      : recommendedReadOrder.slice(0, 8).map((file) => whyRelated(repoPath, file.path, task))
  );

  timing.totalMs = Date.now() - startedAt;
  return {
    result: {
      mode: "discovery",
      task,
      authoritativeHandoff,
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
      whyRelated: whyRelatedItems,
      relatedTests: tests,
      warnings: workflowWarnings
    },
    timing
  };
}

function emptyTiming(): DiscoveryTimingBreakdown {
  return {
    workflowProfilesMs: 0,
    entrypointsMs: 0,
    relatedFilesMs: 0,
    symbolsMs: 0,
    reuseMs: 0,
    relatedTestsMs: 0,
    callGraphMs: 0,
    readOrderMs: 0,
    handoffMs: 0,
    whyRelatedMs: 0,
    totalMs: 0
  };
}

function timed<T>(timing: DiscoveryTimingBreakdown, key: keyof DiscoveryTimingBreakdown, fn: () => T): T {
  const startedAt = Date.now();
  try {
    return fn();
  } finally {
    timing[key] = Date.now() - startedAt;
  }
}

function rankReadOrder(
  task: string,
  entrypoints: DiscoveryResult["entrypoints"],
  related: DiscoveryResult["recommendedReadOrder"],
  reuseCandidates: DiscoveryResult["reuseCandidates"],
  workflowProfiles: WorkflowDiscoveryProfile[]
) {
  const workflowReadOrder = workflowProfiles.flatMap((profile) => profile.readOrder);
  const workflowPaths = new Set(workflowReadOrder.map((item) => item.path));
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
  for (const item of [...workflowReadOrder, ...fromEntrypoints, ...fromReuse, ...related]) {
    const score = isWorkflowProfileReadOrder(item)
      ? item.score
      : workflowSuppressesPath(workflowProfiles, item.path) && !workflowPaths.has(item.path)
        ? Math.min(0.08, discoveryReadScore(task, item.path, item.score))
        : discoveryReadScore(task, item.path, item.score);
    const normalized = {
      ...item,
      score,
      reason:
        workflowSuppressesPath(workflowProfiles, item.path) && !workflowPaths.has(item.path)
          ? `${item.reason}; suppressed by workflow profile`
          : item.reason
    };
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
