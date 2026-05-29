import { discoverCode } from "../discovery/discoverCode.js";
import { traceFeature } from "../discovery/featureTracer.js";
import { findCallers, findCallees } from "../discovery/symbolGraph.js";
import { impactAnalysisV3 } from "./impactAnalysisV3.js";
import { compareKeyedItems } from "./graphEquivalence.js";

export interface EquivalenceQuerySuite {
  discover?: Array<{ id?: string; task: string }>;
  traceFeature?: Array<{ id?: string; task: string; limit?: number }>;
  impact?: Array<{ id?: string; target: string; task?: string }>;
  callers?: Array<{ id?: string; symbol: string }>;
  callees?: Array<{ id?: string; symbol: string }>;
}

export function runEquivalenceQueries(repoPath: string, suite: EquivalenceQuerySuite = {}): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const item of suite.discover ?? []) {
    const result = discoverCode(repoPath, item.task, 12);
    output[`discover:${item.id ?? item.task}`] = [
      ...result.authoritativeHandoff.mustRead.map((file) => `mustRead:${file.path}`),
      ...result.authoritativeHandoff.coreChain.map((step) => `chain:${step.kind}:${step.path}`)
    ].sort();
  }
  for (const item of suite.traceFeature ?? []) {
    const result = traceFeature(repoPath, item.task, item.limit ?? 8);
    output[`traceFeature:${item.id ?? item.task}`] = result.chains
      .flatMap((chain) => chain.path.map((step) => `${step.type}:${step.target}`))
      .sort();
  }
  for (const item of suite.impact ?? []) {
    const result = impactAnalysisV3(repoPath, item.target, item.task ?? item.target);
    output[`impact:${item.id ?? item.target}`] = [
      ...result.impact.affectedEntrypoints.map((path) => `entry:${path}`),
      ...result.impact.affectedTests.map((path) => `test:${path}`),
      ...result.impact.affectedWidgets.map((symbol) => `widget:${symbol}`)
    ].sort();
  }
  for (const item of suite.callers ?? []) {
    const result = findCallers(repoPath, item.symbol, 20);
    output[`callers:${item.id ?? item.symbol}`] = result.callers
      .map((caller) => `${caller.path}:${caller.qualifiedName ?? caller.symbol}`)
      .sort();
  }
  for (const item of suite.callees ?? []) {
    const result = findCallees(repoPath, item.symbol, 20);
    output[`callees:${item.id ?? item.symbol}`] = result.callees
      .map((callee) => `${callee.path}:${callee.qualifiedName ?? callee.symbol}`)
      .sort();
  }
  return output;
}

export function compareQueryOutputs(
  partial: Record<string, string[]>,
  full: Record<string, string[]>
): Record<string, { missingInPartial: string[]; extraInPartial: string[] }> {
  const diff: Record<string, { missingInPartial: string[]; extraInPartial: string[] }> = {};
  for (const key of Array.from(new Set([...Object.keys(partial), ...Object.keys(full)])).sort()) {
    const itemDiff = compareKeyedItems(partial[key] ?? [], full[key] ?? []);
    if (itemDiff.missingInPartial.length > 0 || itemDiff.extraInPartial.length > 0) {
      diff[key] = itemDiff;
    }
  }
  return diff;
}
