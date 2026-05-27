import type { DiscoveryResult } from "../discovery/types.js";

export interface EvalExpected {
  mustReadAny?: string[];
  mustNotRead?: string[];
  chainContains?: string[];
  reuseCandidatesAny?: string[];
  testsAny?: string[];
}

export interface EvalMetrics {
  mustReadPrecision: number;
  mustReadCoverage: number;
  routeToWidgetChainAccuracy: number;
  reuseDecisionAccuracy: number;
  impactCriticalCoverage: number;
  noiseSuppression: number;
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
  const mustReadPrecision =
    mustReadPaths.length === 0 ? 0 : Math.max(0, 1 - forbiddenHits.length / mustReadPaths.length);
  const chainKinds = result.authoritativeHandoff.coreChain.map((step) => step.kind);
  const routeToWidgetChainAccuracy =
    (expected.chainContains ?? []).length === 0
      ? 1
      : ratio(expected.chainContains ?? [], (kind) => chainKinds.some((actual) => actual.includes(kind)));
  const reuseDecisionAccuracy =
    (expected.reuseCandidatesAny ?? []).length === 0
      ? 1
      : ratio(expected.reuseCandidatesAny ?? [], (needle) =>
          result.reuseCandidates.some((hit) =>
            `${hit.symbol ?? ""} ${hit.qualifiedName ?? ""} ${hit.path}`.includes(needle)
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
    0.08 * noiseSuppression +
    0.06 * explanationQuality +
    0.06 * stabilityAndLatency;
  return {
    mustReadPrecision,
    mustReadCoverage,
    routeToWidgetChainAccuracy,
    reuseDecisionAccuracy,
    impactCriticalCoverage,
    noiseSuppression,
    explanationQuality,
    stabilityAndLatency,
    productionScore: Number(productionScore.toFixed(3))
  };
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
