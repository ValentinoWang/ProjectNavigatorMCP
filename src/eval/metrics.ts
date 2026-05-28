import type { DiscoveryResult } from "../discovery/types.js";
import type { SuppressionReason } from "../discovery/suppressionReasons.js";
import type { ChainCompleteness } from "../ui/flutterRouteChain.js";

export interface EvalExpected {
  mustReadAny?: string[];
  mustNotRead?: string[];
  chainContains?: string[];
  reuseCandidatesAny?: string[];
  testsAny?: string[];
  suppressedWithReasons?: Array<{ path: string; reason: SuppressionReason }>;
  maxMustRead?: number;
  minChainCompleteness?: ChainCompleteness;
  supportingContains?: string[];
  readOrderContains?: string[];
  orderedBefore?: Array<{ before: string; after: string }>;
  warningContains?: string[];
  actionContains?: string[];
  recommendedCommandContains?: string[];
  newFileExpected?: string[];
  readOnlyContains?: string[];
  editPolicyContains?: Array<{ path: string; policy: "read_only" | "create" | "inspect_only" | "do_not_touch" }>;
  gateStepContains?: string[];
  fallbackCommandNotContains?: string[];
  profileSourcesAny?: Array<"repo_local" | "built_in">;
}

export interface EvalMetrics {
  mustReadPrecision: number;
  mustReadCoverage: number;
  routeToWidgetChainAccuracy: number;
  reuseDecisionAccuracy: number;
  impactCriticalCoverage: number;
  noiseSuppression: number;
  suppressionReasonQuality: number;
  explanationQuality: number;
  stabilityAndLatency: number;
  productionScore: number;
}

export function scoreDiscoveryResult(result: DiscoveryResult, expected: EvalExpected, latencyMs: number): EvalMetrics {
  const mustReadPaths = result.authoritativeHandoff.mustRead.map((item) => item.path);
  const expectedHits = expected.mustReadAny ?? [];
  const forbidden = expected.mustNotRead ?? [];
  const mustReadCoverage =
    expectedHits.length === 0 ? 1 : ratio(expectedHits, (pattern) => matchesAny(mustReadPaths, pattern));
  const forbiddenHits = mustReadPaths.filter((item) => forbidden.some((pattern) => globMatch(item, pattern)));
  const mustReadBudgetOk = expected.maxMustRead === undefined || mustReadPaths.length <= expected.maxMustRead;
  const mustReadPrecision =
    !mustReadBudgetOk || mustReadPaths.length === 0 ? 0 : Math.max(0, 1 - forbiddenHits.length / mustReadPaths.length);
  const chainKinds = result.authoritativeHandoff.coreChain.map((step) => step.kind);
  const chainContainsAccuracy =
    (expected.chainContains ?? []).length === 0
      ? 1
      : ratio(expected.chainContains ?? [], (kind) => chainKinds.some((actual) => actual.includes(kind)));
  const chainCompletenessAccuracy =
    expected.minChainCompleteness === undefined
      ? 1
      : meetsMinCompleteness(result.authoritativeHandoff.chainCompleteness, expected.minChainCompleteness)
        ? 1
        : 0;
  const routeToWidgetChainAccuracy = Math.min(chainContainsAccuracy, chainCompletenessAccuracy);
  const reuseDecisionAccuracy =
    (expected.reuseCandidatesAny ?? []).length === 0
      ? 1
      : ratio(
          expected.reuseCandidatesAny ?? [],
          (needle) =>
            `${result.authoritativeHandoff.reuseDecision.candidate ?? ""} ${result.authoritativeHandoff.reuseDecision.path ?? ""} ${result.authoritativeHandoff.reuseDecision.recommendedAction}`
              .toLowerCase()
              .includes(needle.toLowerCase()) ||
            result.reuseCandidates.some((hit) =>
              `${hit.symbol ?? ""} ${hit.qualifiedName ?? ""} ${hit.path}`.toLowerCase().includes(needle.toLowerCase())
            )
        );
  const impactCriticalCoverage =
    (expected.testsAny ?? []).length === 0
      ? 1
      : ratio(
          expected.testsAny ?? [],
          (needle) =>
            result.relatedTests.testFiles.some((file) => file.includes(needle)) ||
            result.authoritativeHandoff.impactSummary.affectedTests.some((file) => file.includes(needle))
        );
  const noiseSuppression = forbiddenHits.length === 0 ? 1 : 0;
  const suppressionReasonQuality =
    (expected.suppressedWithReasons ?? []).length === 0
      ? 1
      : ratio(expected.suppressedWithReasons ?? [], (item) => hasSuppressionReason(result, item.path, item.reason));
  const explanationQuality =
    result.authoritativeHandoff.mustRead.length === 0
      ? 0
      : ratio(
          result.authoritativeHandoff.mustRead,
          (item) => item.evidence.length >= 2 || item.evidence.some((e) => /route|compose|reuse/.test(e))
        );
  const stabilityAndLatency = latencyMs <= 2500 ? 1 : latencyMs <= 5000 ? 0.8 : 0.6;
  const productionScore =
    0.22 * mustReadPrecision +
    0.18 * mustReadCoverage +
    0.16 * routeToWidgetChainAccuracy +
    0.12 * reuseDecisionAccuracy +
    0.12 * impactCriticalCoverage +
    0.04 * noiseSuppression +
    0.08 * suppressionReasonQuality +
    0.02 * explanationQuality +
    0.06 * stabilityAndLatency;
  return {
    mustReadPrecision,
    mustReadCoverage,
    routeToWidgetChainAccuracy,
    reuseDecisionAccuracy,
    impactCriticalCoverage,
    noiseSuppression,
    suppressionReasonQuality,
    explanationQuality,
    stabilityAndLatency,
    productionScore: Number(productionScore.toFixed(3))
  };
}

function hasSuppressionReason(result: DiscoveryResult, pathPattern: string, reason: SuppressionReason): boolean {
  const suppressed = result.authoritativeHandoff.suppressedCandidates.map((item) => ({
    path: item.path,
    reason: item.reason
  }));
  const supporting = result.authoritativeHandoff.supportingContext
    .filter((item) => item.reason)
    .map((item) => ({ path: item.path, reason: item.reason }));
  return [...suppressed, ...supporting].some(
    (item) => Boolean(item.reason) && item.reason === reason && globMatch(item.path, pathPattern)
  );
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

function ratio<T>(items: T[], predicate: (item: T) => boolean): number {
  if (items.length === 0) {
    return 1;
  }
  return items.filter(predicate).length / items.length;
}

function matchesAny(paths: string[], pattern: string): boolean {
  return paths.some((item) => item === pattern || globMatch(item, pattern));
}

function globMatch(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(value);
}
