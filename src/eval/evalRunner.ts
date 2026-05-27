import { readFileSync } from "node:fs";
import { openProject } from "../db/project.js";
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
    return {
      id: item.id,
      task: item.task,
      latencyMs,
      metrics,
      passed: strict ? metrics.productionScore >= 0.9 : metrics.productionScore >= 0.75
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
