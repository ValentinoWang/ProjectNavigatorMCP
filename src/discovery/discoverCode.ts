import { findRelatedFiles } from "../graph/relatedFiles.js";
import { relatedTests } from "../graph/relatedTests.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { openProject } from "../db/project.js";
import { buildAuthoritativeHandoff, type AuthoritativeHandoff } from "./authoritativeChain.js";
import { discoveryReadScore, tierReadOrder } from "./discoveryQuality.js";
import { findEntrypoints, loadEntrypointCatalog, rankEntrypointsFromCatalog } from "./entrypoints.js";
import { findReusableComponents } from "./reuse.js";
import { findCallees } from "./symbolGraph.js";
import type { DiscoveryResult, DiscoveryTimingBreakdown } from "./types.js";
import { whyRelatedBatch } from "./whyRelated.js";
import { planDiscoveryQuery, type DiscoveryQueryPlan } from "./queryPlan.js";
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

export interface DiscoveryTimingOptions {
  requireRouteChain?: boolean;
  queryPlan?: DiscoveryQueryPlan;
  includeWhyRelated?: boolean;
}

export type DiscoveryCacheBucket =
  | "fileCatalog"
  | "symbolCatalog"
  | "routeCatalog"
  | "testCatalog"
  | "commandCatalog"
  | "workflowProfiles"
  | "entrypointCatalog"
  | "entrypoints"
  | "relatedFiles"
  | "symbols"
  | "reuse"
  | "relatedTests"
  | "callGraph"
  | "readOrder"
  | "handoffBase"
  | "whyRelated";

export interface DiscoveryRuntimeContext {
  caches: Record<DiscoveryCacheBucket, Map<string, unknown>>;
  cacheStats: Record<DiscoveryCacheBucket, { hits: number; misses: number }>;
}

export function createDiscoveryRuntimeContext(): DiscoveryRuntimeContext {
  const buckets: DiscoveryCacheBucket[] = [
    "fileCatalog",
    "symbolCatalog",
    "routeCatalog",
    "testCatalog",
    "commandCatalog",
    "workflowProfiles",
    "entrypointCatalog",
    "entrypoints",
    "relatedFiles",
    "symbols",
    "reuse",
    "relatedTests",
    "callGraph",
    "readOrder",
    "handoffBase",
    "whyRelated"
  ];
  return {
    caches: Object.fromEntries(buckets.map((bucket) => [bucket, new Map<string, unknown>()])) as Record<
      DiscoveryCacheBucket,
      Map<string, unknown>
    >,
    cacheStats: Object.fromEntries(buckets.map((bucket) => [bucket, { hits: 0, misses: 0 }])) as Record<
      DiscoveryCacheBucket,
      { hits: number; misses: number }
    >
  };
}

export function discoverCode(repoPath: string, task: string, limit = 15): DiscoveryResult {
  return discoverCodeWithTiming(repoPath, task, limit).result;
}

export function discoverCodeWithTiming(
  repoPath: string,
  task: string,
  limit = 15,
  context?: DiscoveryRuntimeContext,
  options: DiscoveryTimingOptions = {}
): TimedDiscoveryResult {
  const startedAt = Date.now();
  const timing = emptyTiming();
  if (context) {
    warmRepoCatalogs(context, repoPath);
  }
  const workflowProfiles = timed(timing, "workflowProfilesMs", () =>
    cached(context, "workflowProfiles", task, () => resolveWorkflowDiscoveryProfiles(repoPath, task))
  );
  const hasWorkflowProfile = workflowProfiles.length > 0;
  const queryPlan = options.queryPlan ?? planDiscoveryQuery(task, hasWorkflowProfile);
  const entrypoints = timed(timing, "entrypointsMs", () => {
    if (!context) {
      return findEntrypoints(repoPath, task, 10).entrypoints;
    }
    const catalog = cached(context, "entrypointCatalog", repoPath, () => loadEntrypointCatalog(repoPath));
    return cached(context, "entrypoints", `${task}:10`, () => rankEntrypointsFromCatalog(catalog, task, 10));
  });
  const related = timed(timing, "relatedFilesMs", () =>
    cached(context, "relatedFiles", `${task}:${hasWorkflowProfile ? Math.min(5, limit) : limit}`, () =>
      !queryPlan.runRelatedFiles
        ? []
        : hasWorkflowProfile
          ? workflowProfiles.flatMap((profile) => profile.readOrder).slice(0, Math.min(5, limit))
          : findRelatedFiles(repoPath, task, limit).files
    )
  );
  const coreSymbols = timed(timing, "symbolsMs", () =>
    cached(context, "symbols", task, () =>
      !queryPlan.runSymbols || hasWorkflowProfile ? [] : findSymbol(repoPath, task, 12)
    )
  );
  const reuse = timed(timing, "reuseMs", () =>
    cached(context, "reuse", task, () =>
      !queryPlan.runReuse || hasWorkflowProfile
        ? { reuseCandidates: [], duplicateRisks: [] }
        : findReusableComponents(repoPath, task, 8)
    )
  );
  const initialTests = timed(timing, "relatedTestsMs", () =>
    cached(context, "relatedTests", `${task}:${entrypoints.length}:${related.length}`, () =>
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
    )
  );
  const callGraphPreview = timed(timing, "callGraphMs", () =>
    cached(context, "callGraph", task, () =>
      !queryPlan.runCallGraph || hasWorkflowProfile
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
    )
  );
  const recommendedReadOrder = timed(timing, "readOrderMs", () =>
    cached(context, "readOrder", task, () =>
      rankReadOrder(task, entrypoints, related, reuse.reuseCandidates, workflowProfiles)
    )
  );
  const authoritativeHandoff = timed(timing, "handoffMs", () =>
    cached(context, "handoffBase", `${task}:${options.requireRouteChain ? "route" : "workflow"}`, () =>
      buildAuthoritativeHandoff(
        repoPath,
        task,
        recommendedReadOrder,
        reuse.reuseCandidates,
        initialTests,
        workflowProfiles,
        {
          buildRouteChain: queryPlan.runRouteChain || Boolean(options.requireRouteChain)
        }
      )
    )
  );
  const finalRecommendedReadOrder =
    hasWorkflowProfile && !options.requireRouteChain
      ? recommendedReadOrder
      : mergeHandoffReadOrder(recommendedReadOrder, authoritativeHandoff, limit);
  const tiers = tierReadOrder(task, finalRecommendedReadOrder, limit);
  // The initial test recommendation is already based on the ranked entrypoints and
  // related files. Reusing it avoids opening the same graph catalogs a second time
  // after the handoff only reorders those candidates.
  const finalTests = initialTests;
  const workflowWarnings = workflowProfiles.flatMap((profile) => profile.warnings);
  const whyRelatedItems = timed(timing, "whyRelatedMs", () =>
    cached(context, "whyRelated", task, () =>
      !queryPlan.runWhyRelated || options.includeWhyRelated === false
        ? []
        : hasWorkflowProfile
          ? finalRecommendedReadOrder.slice(0, 8).map((file) => ({
              target: file.path,
              task,
              score: file.score,
              evidence: [{ type: "workflow_profile", detail: file.reason, score: file.score }]
            }))
          : whyRelatedBatch(
              repoPath,
              finalRecommendedReadOrder.slice(0, 8).map((file) => file.path),
              task
            )
    )
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
      recommendedReadOrder: finalRecommendedReadOrder,
      mustRead: tiers.mustRead,
      shouldInspect: tiers.shouldInspect,
      reuseBeforeCreate: reuse.reuseCandidates.filter((hit) => hit.verdict !== "create_new_allowed"),
      ignoreForNow: tiers.ignoreForNow,
      whyRelated: whyRelatedItems,
      relatedTests: finalTests,
      warnings: workflowWarnings
    },
    timing
  };
}

function mergeHandoffReadOrder(
  recommendedReadOrder: DiscoveryResult["recommendedReadOrder"],
  handoff: AuthoritativeHandoff,
  limit: number
): DiscoveryResult["recommendedReadOrder"] {
  const best = new Map<string, DiscoveryResult["recommendedReadOrder"][number]>();
  const add = (item: DiscoveryResult["recommendedReadOrder"][number]) => {
    const existing = best.get(item.path);
    if (!existing || item.score > existing.score) {
      best.set(item.path, item);
    }
  };

  for (const file of handoff.mustRead) {
    add({
      path: file.path,
      score: Math.max(0.98, file.confidence),
      reason: `Authoritative handoff mustRead: ${file.why}`
    });
  }
  for (const step of handoff.coreChain) {
    add({
      path: step.path,
      score: Math.max(0.94, step.confidence),
      reason: `Route-to-widget ${step.kind}: ${step.symbol ?? step.path}`
    });
  }
  if (handoff.testCoverage?.covered && handoff.testCoverage.coverageStrength === "strong") {
    for (const file of handoff.testCoverage.testFiles) {
      add({
        path: file,
        score: 0.88,
        reason: "Strong route-to-widget test coverage."
      });
    }
  }
  for (const file of recommendedReadOrder) {
    add(file);
  }
  return Array.from(best.values())
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, Math.max(15, limit));
}

function relatedTestSeedPaths(
  handoff: AuthoritativeHandoff,
  readOrder: DiscoveryResult["recommendedReadOrder"]
): string[] {
  return Array.from(
    new Set([
      ...handoff.mustRead.map((item) => item.path),
      ...handoff.coreChain.map((step) => step.path),
      ...(handoff.testCoverage?.testFiles ?? []),
      ...readOrder.slice(0, 10).map((item) => item.path)
    ])
  );
}

function warmRepoCatalogs(context: DiscoveryRuntimeContext, repoPath: string): void {
  cached(context, "fileCatalog", repoPath, () => loadCatalogCount(repoPath, "files"));
  cached(context, "symbolCatalog", repoPath, () => loadSymbolCatalogCount(repoPath));
  cached(context, "routeCatalog", repoPath, () => loadCatalogCount(repoPath, "routes"));
  cached(context, "testCatalog", repoPath, () => loadCatalogCount(repoPath, "tests"));
  cached(context, "commandCatalog", repoPath, () => loadCatalogCount(repoPath, "commands"));
}

function loadCatalogCount(repoPath: string, table: "files" | "routes" | "tests" | "commands"): number {
  const project = openProject(repoPath);
  try {
    return (
      project.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE repo_id = ?`).get(project.repo.id) as {
        count: number;
      }
    ).count;
  } finally {
    project.db.close();
  }
}

function loadSymbolCatalogCount(repoPath: string): number {
  const project = openProject(repoPath);
  try {
    return (
      project.db
        .prepare("SELECT COUNT(*) AS count FROM symbols s JOIN files f ON f.id = s.file_id WHERE f.repo_id = ?")
        .get(project.repo.id) as { count: number }
    ).count;
  } finally {
    project.db.close();
  }
}

function cached<T>(
  context: DiscoveryRuntimeContext | undefined,
  bucket: DiscoveryCacheBucket,
  key: string,
  fn: () => T
): T {
  if (!context) {
    return fn();
  }
  const cache = context.caches[bucket];
  if (cache.has(key)) {
    context.cacheStats[bucket].hits += 1;
    return cache.get(key) as T;
  }
  context.cacheStats[bucket].misses += 1;
  const value = fn();
  cache.set(key, value);
  return value;
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
    const suppressedByWorkflow = workflowSuppressesPath(workflowProfiles, item.path) && !workflowPaths.has(item.path);
    if (suppressedByWorkflow && workflowProfiles.length > 0) {
      continue;
    }
    const score = isWorkflowProfileReadOrder(item) ? item.score : discoveryReadScore(task, item.path, item.score);
    const normalized = {
      ...item,
      score,
      reason: item.reason
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
