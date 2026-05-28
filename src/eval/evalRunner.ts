import { readFileSync } from "node:fs";
import { openProject } from "../db/project.js";
import type { DiscoveryResult } from "../discovery/types.js";
import type { ChainCompleteness } from "../ui/flutterRouteChain.js";
import { discoverCode } from "../discovery/discoverCode.js";
import { scoreDiscoveryResult, type EvalExpected, type EvalMetrics } from "./metrics.js";

export interface EvalCase {
  id: string;
  task: string;
  mode?: "discovery";
  expected: EvalExpected;
}

export interface EvalSuite {
  cases: EvalCase[];
}

export interface EvalCaseResult {
  id: string;
  task: string;
  latencyMs: number;
  metrics: EvalMetrics;
  hardFailures: string[];
  passed: boolean;
}

export interface EvalRunResult {
  suitePath: string;
  productionScore: number;
  cases: EvalCaseResult[];
  passed: boolean;
}

export function runDiscoveryEval(repoPath: string, suitePath: string, strict = false): EvalRunResult {
  const suite = JSON.parse(readFileSync(suitePath, "utf8")) as EvalSuite;
  const cases = suite.cases.map((item) => {
    const startedAt = Date.now();
    const result = discoverCode(repoPath, item.task, 15);
    const latencyMs = Date.now() - startedAt;
    const metrics = scoreDiscoveryResult(result, item.expected, latencyMs);
    const hardFailures = strict ? strictHardFailures(metrics, item.expected, result) : [];
    return {
      id: item.id,
      task: item.task,
      latencyMs,
      metrics,
      hardFailures,
      passed: strict ? hardFailures.length === 0 && metrics.productionScore >= 0.9 : metrics.productionScore >= 0.75
    };
  });
  const productionScore = Number(
    (cases.reduce((total, item) => total + item.metrics.productionScore, 0) / Math.max(1, cases.length)).toFixed(3)
  );
  const output = {
    suitePath,
    productionScore,
    cases,
    passed: cases.every((item) => item.passed) && productionScore >= (strict ? 0.9 : 0.75)
  };
  storeEvalRun(repoPath, suitePath, productionScore, output);
  return output;
}

function strictHardFailures(metrics: EvalMetrics, expected: EvalExpected, result: DiscoveryResult): string[] {
  const failures: string[] = [];
  const mustReadPaths = result.authoritativeHandoff.mustRead.map((item) => item.path);
  if (expected.maxMustRead !== undefined && mustReadPaths.length > expected.maxMustRead) {
    failures.push("max_must_read_exceeded");
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
  return failures;
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
