import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDiscoveryEval } from "../eval/evalRunner.js";
import { scanRepo } from "../scanner/scanRepo.js";

export interface BenchmarkResult {
  repo: string;
  suitePath: string;
  generatedAt: string;
  fullScanMs: number;
  noChangeIncrementalMs: number;
  metadataOnlyMs: number;
  smallPartialMs: number;
  batchPartialMs: number;
  deletePartialMs: number;
  renamePartialMs: number;
  freshEvalMs: number;
  metadataEvalMs: number;
  cacheStats: ReturnType<typeof runDiscoveryEval>["cacheStats"];
  slowestStages: ReturnType<typeof runDiscoveryEval>["slowestStages"];
}

export function benchmarkFreshGraph(repoPath: string, suitePath: string): BenchmarkResult {
  const benchRepo = copyRepo(repoPath, "pnav-benchmark-");
  try {
    const fullScanMs = timed(() => scanRepo(benchRepo, { mode: "full" }));
    const noChangeIncrementalMs = timed(() => scanRepo(benchRepo, { mode: "incremental" }));
    const metadataOnlyMs = timed(() => scanRepo(benchRepo, { mode: "incremental", metadataOnly: true }));
    const smallPartialMs = timed(() => {
      touchCodeFile(benchRepo, "src/pnav_benchmark_small.ts", "export const pnavBenchmarkSmall = 1;\n");
      scanRepo(benchRepo, { mode: "incremental" });
    });
    const batchPartialMs = timed(() => {
      for (let index = 0; index < 21; index += 1) {
        touchCodeFile(benchRepo, `src/pnav_benchmark_batch_${index}.ts`, `export const batch${index} = ${index};\n`);
      }
      scanRepo(benchRepo, { mode: "incremental" });
    });
    const deletePartialMs = timed(() => {
      touchCodeFile(benchRepo, "src/pnav_benchmark_delete.ts", "export const pnavBenchmarkDelete = 1;\n");
      scanRepo(benchRepo, { mode: "incremental" });
      rmSync(path.join(benchRepo, "src/pnav_benchmark_delete.ts"), { force: true });
      scanRepo(benchRepo, { mode: "incremental" });
    });
    const renamePartialMs = timed(() => {
      touchCodeFile(benchRepo, "src/pnav_benchmark_rename.ts", "export function PnavBenchmarkBefore() { return 1; }\n");
      scanRepo(benchRepo, { mode: "incremental" });
      touchCodeFile(benchRepo, "src/pnav_benchmark_rename.ts", "export function PnavBenchmarkAfter() { return 1; }\n");
      scanRepo(benchRepo, { mode: "incremental" });
    });
    const freshEval = timedResult(() => runDiscoveryEval(benchRepo, suitePath, { strict: true }));
    const metadataEval = timedResult(() =>
      runDiscoveryEval(benchRepo, suitePath, { strict: true, metadataOnly: true })
    );
    return {
      repo: repoPath,
      suitePath,
      generatedAt: new Date().toISOString(),
      fullScanMs,
      noChangeIncrementalMs,
      metadataOnlyMs,
      smallPartialMs,
      batchPartialMs,
      deletePartialMs,
      renamePartialMs,
      freshEvalMs: freshEval.durationMs,
      metadataEvalMs: metadataEval.durationMs,
      cacheStats: metadataEval.result.cacheStats,
      slowestStages: metadataEval.result.slowestStages
    };
  } finally {
    rmSync(benchRepo, { recursive: true, force: true });
  }
}

function timed(fn: () => void): number {
  const startedAt = Date.now();
  fn();
  return Date.now() - startedAt;
}

function timedResult<T>(fn: () => T): { durationMs: number; result: T } {
  const startedAt = Date.now();
  const result = fn();
  return { durationMs: Date.now() - startedAt, result };
}

function copyRepo(repoPath: string, prefix: string): string {
  const target = mkdtempSync(path.join(tmpdir(), prefix));
  cpSync(repoPath, target, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`)
  });
  rmSync(path.join(target, ".pnav"), { recursive: true, force: true });
  return target;
}

function touchCodeFile(repoPath: string, filePath: string, content: string): void {
  const target = path.join(repoPath, filePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
