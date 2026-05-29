import { readFileSync } from "node:fs";
import { openProject } from "../db/project.js";
import type { DiscoveryResult, DiscoveryTimingBreakdown } from "../discovery/types.js";
import type { ChainCompleteness } from "../ui/flutterRouteChain.js";
import {
  createDiscoveryRuntimeContext,
  discoverCodeWithTiming,
  type DiscoveryRuntimeContext
} from "../discovery/discoverCode.js";
import { scanRepo } from "../scanner/scanRepo.js";
import type { ScanResult } from "../scanner/types.js";
import { scoreDiscoveryResult, type EvalExpected, type EvalMetrics } from "./metrics.js";

export interface EvalCase {
  id: string;
  task: string;
  mode?: "discovery";
  requiresFreshCodeGraph?: boolean;
  expected: EvalExpected;
}

export interface EvalSuite {
  cases: EvalCase[];
}

export interface EvalCaseResult {
  id: string;
  task: string;
  latencyMs: number;
  latencyBreakdown: DiscoveryTimingBreakdown;
  metrics: EvalMetrics;
  hardFailures: string[];
  passed: boolean;
}

export interface EvalRunResult {
  suitePath: string;
  productionScore: number;
  totalLatencyMs: number;
  slowestStages: Array<{ stage: keyof DiscoveryTimingBreakdown; latencyMs: number }>;
  indexStatus: EvalIndexStatus;
  evalValidity: EvalValidity;
  cacheStats: DiscoveryRuntimeContext["cacheStats"];
  cases: EvalCaseResult[];
  passed: boolean;
}

export interface EvalRunOptions {
  strict?: boolean;
  metadataOnly?: boolean;
  allowStaleCodeGraph?: boolean;
}

export interface EvalIndexStatus {
  workflowProfilesFresh: boolean;
  evalSuitesFresh: boolean;
  commandsFresh: boolean;
  documentsFresh: boolean;
  codeGraphFresh: boolean;
  codeGraphStale: boolean;
  codeGraphStaleReason?: string;
  scanIncremental?: ScanResult["incremental"];
}

export interface EvalValidity {
  scoreScope: "full_graph" | "metadata_only";
  freshCodeGraphRequired: boolean;
  validFor: string[];
  notValidFor: string[];
}

export function runDiscoveryEval(
  repoPath: string,
  suitePath: string,
  strictOrOptions: boolean | EvalRunOptions = false
): EvalRunResult {
  const options = normalizeEvalOptions(strictOrOptions);
  const preflightScan = options.metadataOnly
    ? scanRepo(repoPath, { mode: "incremental", metadataOnly: true })
    : undefined;
  const indexStatus = buildEvalIndexStatus(preflightScan);
  const context = createDiscoveryRuntimeContext();
  const suite = JSON.parse(readFileSync(suitePath, "utf8")) as EvalSuite;
  const cases = suite.cases.map((item) => {
    const { result, timing } = discoverCodeWithTiming(repoPath, item.task, 15, context, {
      requireRouteChain: requiresRouteChain(item)
    });
    const latencyMs = timing.totalMs;
    const metrics = scoreDiscoveryResult(result, item.expected, latencyMs);
    const hardFailures = options.strict ? strictHardFailures(metrics, item, result, indexStatus, latencyMs) : [];
    return {
      id: item.id,
      task: item.task,
      latencyMs,
      latencyBreakdown: timing,
      metrics,
      hardFailures,
      passed: options.strict
        ? hardFailures.length === 0 && metrics.productionScore >= 0.9
        : metrics.productionScore >= 0.75
    };
  });
  const productionScore = Number(
    (cases.reduce((total, item) => total + item.metrics.productionScore, 0) / Math.max(1, cases.length)).toFixed(3)
  );
  const output = {
    suitePath,
    productionScore,
    totalLatencyMs: cases.reduce((total, item) => total + item.latencyMs, 0),
    slowestStages: slowestStages(cases),
    indexStatus,
    evalValidity: buildEvalValidity(indexStatus, suite),
    cacheStats: context.cacheStats,
    cases,
    passed: cases.every((item) => item.passed) && productionScore >= (options.strict ? 0.9 : 0.75)
  };
  storeEvalRun(repoPath, suitePath, productionScore, output);
  return output;
}

function requiresRouteChain(item: EvalCase): boolean {
  return Boolean(item.expected.minChainCompleteness) || (item.expected.chainContains ?? []).length > 0;
}

function buildEvalValidity(indexStatus: EvalIndexStatus, suite: EvalSuite): EvalValidity {
  const freshCodeGraphRequired = suite.cases.some(
    (item) => Boolean(item.requiresFreshCodeGraph) || Boolean(item.expected.requiresFreshCodeGraph)
  );
  const metadataOnly = indexStatus.codeGraphStale;
  return {
    scoreScope: metadataOnly ? "metadata_only" : "full_graph",
    freshCodeGraphRequired,
    validFor: metadataOnly
      ? [
          "workflow profile matching",
          "workflowProtocol assertions",
          "mustRead direct-target policy",
          "recommendedCommands / gateSteps"
        ]
      : [
          "fresh route and symbol discovery",
          "fresh symbol graph",
          "fresh impact analysis",
          "workflow profile matching"
        ],
    notValidFor: metadataOnly
      ? [
          "fresh symbol graph",
          "fresh incoming edges",
          "fresh route-to-widget chain from changed source",
          "fresh impact analysis"
        ]
      : []
  };
}

function normalizeEvalOptions(strictOrOptions: boolean | EvalRunOptions): Required<EvalRunOptions> {
  if (typeof strictOrOptions === "boolean") {
    return { strict: strictOrOptions, metadataOnly: false, allowStaleCodeGraph: false };
  }
  return {
    strict: Boolean(strictOrOptions.strict),
    metadataOnly: Boolean(strictOrOptions.metadataOnly),
    allowStaleCodeGraph: Boolean(strictOrOptions.allowStaleCodeGraph) || Boolean(strictOrOptions.metadataOnly)
  };
}

function buildEvalIndexStatus(preflightScan: ScanResult | undefined): EvalIndexStatus {
  const incremental = preflightScan?.incremental;
  return {
    workflowProfilesFresh: true,
    evalSuitesFresh: true,
    commandsFresh: true,
    documentsFresh: true,
    codeGraphFresh: !incremental?.codeGraphStale,
    codeGraphStale: Boolean(incremental?.codeGraphStale),
    codeGraphStaleReason: incremental?.codeGraphStaleReason,
    scanIncremental: incremental
  };
}

function strictHardFailures(
  metrics: EvalMetrics,
  item: EvalCase,
  result: DiscoveryResult,
  indexStatus: EvalIndexStatus,
  latencyMs: number
): string[] {
  const expected = item.expected;
  const failures: string[] = [];
  if ((item.requiresFreshCodeGraph || expected.requiresFreshCodeGraph) && indexStatus.codeGraphStale) {
    failures.push("fresh_code_graph_required_but_stale");
  }
  if (expected.requiresEquivalentToFull && indexStatus.codeGraphStale) {
    failures.push("partial_not_equivalent_to_full");
  }
  if (expected.maxFreshEvalMs !== undefined && !indexStatus.codeGraphStale && latencyMs > expected.maxFreshEvalMs) {
    failures.push("fresh_eval_latency_budget_exceeded");
  }
  const mustReadPaths = result.authoritativeHandoff.mustRead.map((item) => item.path);
  if (mustReadPaths.some((file) => file.includes("(deleted)") || file.endsWith(".deleted"))) {
    failures.push("deleted_file_in_must_read");
  }
  if (expected.maxMustRead !== undefined && mustReadPaths.length > expected.maxMustRead) {
    failures.push("max_must_read_exceeded");
  }
  if ((expected.mustReadAny ?? []).length > 0 && metrics.mustReadCoverage < 1) {
    failures.push("must_read_missing");
  }
  if ((expected.mustNotRead ?? []).some((pattern) => mustReadPaths.some((file) => globMatch(file, pattern)))) {
    failures.push("must_not_read_in_must_read");
  }
  if ((expected.suppressedWithReasons ?? []).length > 0 && metrics.suppressionReasonQuality < 1) {
    failures.push("suppression_reason_mismatch");
  }
  if (
    expected.minChainCompleteness !== undefined &&
    !meetsMinCompleteness(result.authoritativeHandoff.chainCompleteness, expected.minChainCompleteness)
  ) {
    failures.push("chain_completeness_below_min");
  }
  const supportingPaths = result.authoritativeHandoff.supportingContext.map((item) => item.path);
  if ((expected.supportingContains ?? []).some((pattern) => !matchesAny(supportingPaths, pattern))) {
    failures.push("supporting_context_missing");
  }
  const readOrderPaths = result.recommendedReadOrder.map((item) => item.path);
  if ((expected.readOrderContains ?? []).some((pattern) => !matchesAny(readOrderPaths, pattern))) {
    failures.push("read_order_missing");
  }
  for (const pair of expected.orderedBefore ?? []) {
    const beforeIndex = firstMatchingIndex(readOrderPaths, pair.before);
    const afterIndex = firstMatchingIndex(readOrderPaths, pair.after);
    if (beforeIndex < 0 || afterIndex < 0) {
      failures.push("read_order_missing");
    } else if (beforeIndex >= afterIndex) {
      failures.push("read_order_mismatch");
    }
  }
  const warnings = [...result.warnings, ...result.authoritativeHandoff.warnings].join("\n").toLowerCase();
  if ((expected.warningContains ?? []).some((needle) => !warnings.includes(needle.toLowerCase()))) {
    failures.push("warning_missing");
  }
  const protocol = result.authoritativeHandoff.workflowProtocol;
  if (
    (expected.actionContains ?? []).some(
      (needle) => !protocol.actions.some((item) => workflowText(item).includes(needle.toLowerCase()))
    )
  ) {
    failures.push("workflow_action_missing");
  }
  if (
    (expected.recommendedCommandContains ?? []).some(
      (needle) => !protocol.recommendedCommands.some((item) => workflowText(item).includes(needle.toLowerCase()))
    )
  ) {
    failures.push("recommended_command_missing");
  }
  if (
    (expected.newFileExpected ?? []).some(
      (needle) => !protocol.newFileExpectations.some((item) => workflowText(item).includes(needle.toLowerCase()))
    )
  ) {
    failures.push("new_file_expectation_missing");
  }
  if (
    (expected.readOnlyContains ?? []).some(
      (needle) =>
        !protocol.editPolicies.some(
          (item) => item.policy === "read_only" && workflowText(item).includes(needle.toLowerCase())
        )
    )
  ) {
    failures.push("read_only_policy_missing");
  }
  if (
    (expected.editPolicyContains ?? []).some(
      (expectedPolicy) =>
        !protocol.editPolicies.some(
          (item) =>
            item.policy === expectedPolicy.policy &&
            (item.path === expectedPolicy.path || globMatch(item.path, expectedPolicy.path))
        )
    )
  ) {
    failures.push("edit_policy_missing");
  }
  if (
    (expected.gateStepContains ?? []).some(
      (needle) => !protocol.gateSteps.some((item) => workflowText(item).includes(needle.toLowerCase()))
    )
  ) {
    failures.push("gate_step_missing");
  }
  if (
    (expected.profileSourcesAny ?? []).length > 0 &&
    !(expected.profileSourcesAny ?? []).some((source) => protocol.profiles.some((profile) => profile.source === source))
  ) {
    failures.push("profile_source_missing");
  }
  const fallbackText = (result.relatedTests.fallbackCommands ?? [])
    .map((command) => `${command.name} ${command.command} ${command.reason ?? ""}`)
    .join("\n")
    .toLowerCase();
  if ((expected.fallbackCommandNotContains ?? []).some((needle) => fallbackText.includes(needle.toLowerCase()))) {
    failures.push("fallback_command_forbidden");
  }
  if (expected.forbidStaleCriticalEvidence && hasStaleCriticalEvidence(result)) {
    failures.push("stale_critical_evidence");
  }
  return failures;
}

function hasStaleCriticalEvidence(result: DiscoveryResult): boolean {
  return result.authoritativeHandoff.mustRead.some((file) =>
    file.evidence.some((item) => /stale|cochange|duplicate/.test(item.toLowerCase()))
  );
}

function slowestStages(cases: EvalCaseResult[]): Array<{ stage: keyof DiscoveryTimingBreakdown; latencyMs: number }> {
  const totals = new Map<keyof DiscoveryTimingBreakdown, number>();
  for (const item of cases) {
    for (const [stage, latencyMs] of Object.entries(item.latencyBreakdown) as Array<
      [keyof DiscoveryTimingBreakdown, number]
    >) {
      if (stage === "totalMs") {
        continue;
      }
      totals.set(stage, (totals.get(stage) ?? 0) + latencyMs);
    }
  }
  return Array.from(totals.entries())
    .map(([stage, latencyMs]) => ({ stage, latencyMs }))
    .sort((a, b) => b.latencyMs - a.latencyMs || a.stage.localeCompare(b.stage))
    .slice(0, 5);
}

function meetsMinCompleteness(actual: ChainCompleteness, expected: ChainCompleteness): boolean {
  return completenessRank(actual) >= completenessRank(expected);
}

function completenessRank(value: ChainCompleteness): number {
  const order: Record<ChainCompleteness, number> = {
    route_page_only: 1,
    route_main_widget: 2,
    route_section_card: 3,
    route_test_covered: 4
  };
  return order[value];
}

function globMatch(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(value);
}

function matchesAny(paths: string[], pattern: string): boolean {
  return paths.some((item) => item === pattern || globMatch(item, pattern));
}

function firstMatchingIndex(paths: string[], pattern: string): number {
  return paths.findIndex((item) => item === pattern || globMatch(item, pattern));
}

function workflowText(value: unknown): string {
  return JSON.stringify(value).toLowerCase();
}

function storeEvalRun(repoPath: string, suitePath: string, score: number, metrics: unknown): void {
  const project = openProject(repoPath);
  try {
    project.db
      .prepare("INSERT INTO discovery_eval_runs (repo_id, suite_path, score, metrics_json) VALUES (?, ?, ?, ?)")
      .run(project.repo.id, suitePath, score, JSON.stringify(metrics));
  } finally {
    project.db.close();
  }
}
