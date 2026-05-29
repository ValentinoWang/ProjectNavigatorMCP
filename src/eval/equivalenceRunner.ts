import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { compareGraphSnapshots, type EquivalenceResult } from "../graph/graphEquivalence.js";
import { graphSnapshot } from "../graph/graphSnapshot.js";
import { compareQueryOutputs, runEquivalenceQueries, type EquivalenceQuerySuite } from "../graph/queryEquivalence.js";
import { scanRepo } from "../scanner/scanRepo.js";

export interface MutationSuite {
  mutations: MutationCase[];
}

export interface MutationCase {
  id: string;
  description?: string;
  steps: MutationStep[];
  queries?: EquivalenceQuerySuite;
}

export type MutationStep =
  | { type: "writeFile"; path: string; content: string }
  | { type: "appendFile"; path: string; content: string }
  | { type: "deleteFile"; path: string }
  | { type: "moveFile"; from: string; to: string };

export interface EquivalenceRunResult {
  repo: string;
  suitePath: string;
  generatedAt: string;
  passed: boolean;
  results: EquivalenceResult[];
}

export function runEquivalenceSuite(repoPath: string, suitePath: string): EquivalenceRunResult {
  const suite = JSON.parse(readFileSync(suitePath, "utf8")) as MutationSuite;
  const results = suite.mutations.map((mutation) => runMutationEquivalence(repoPath, mutation));
  return {
    repo: repoPath,
    suitePath,
    generatedAt: new Date().toISOString(),
    passed: results.every((result) => result.passed),
    results
  };
}

function runMutationEquivalence(repoPath: string, mutation: MutationCase): EquivalenceResult {
  const partialRepo = copyRepo(repoPath, `pnav-partial-${mutation.id}-`);
  const fullRepo = copyRepo(repoPath, `pnav-full-${mutation.id}-`);
  try {
    scanRepo(partialRepo, { mode: "full" });
    applyMutation(partialRepo, mutation);
    scanRepo(partialRepo, { mode: "incremental" });
    const partialSnapshot = graphSnapshot(partialRepo);
    const partialQueries = runEquivalenceQueries(partialRepo, mutation.queries);

    applyMutation(fullRepo, mutation);
    scanRepo(fullRepo, { mode: "full" });
    const fullSnapshot = graphSnapshot(fullRepo);
    const fullQueries = runEquivalenceQueries(fullRepo, mutation.queries);

    return compareGraphSnapshots(
      mutation.id,
      partialSnapshot,
      fullSnapshot,
      compareQueryOutputs(partialQueries, fullQueries),
      {}
    );
  } finally {
    rmSync(partialRepo, { recursive: true, force: true });
    rmSync(fullRepo, { recursive: true, force: true });
  }
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

function applyMutation(repoPath: string, mutation: MutationCase): void {
  for (const step of mutation.steps) {
    if (step.type === "writeFile") {
      const target = path.join(repoPath, step.path);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, step.content);
    } else if (step.type === "appendFile") {
      const target = path.join(repoPath, step.path);
      const previous = existsSync(target) ? readFileSync(target, "utf8") : "";
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `${previous}${step.content}`);
    } else if (step.type === "deleteFile") {
      rmSync(path.join(repoPath, step.path), { force: true });
    } else if (step.type === "moveFile") {
      const from = path.join(repoPath, step.from);
      const to = path.join(repoPath, step.to);
      mkdirSync(path.dirname(to), { recursive: true });
      renameSync(from, to);
    }
  }
}
