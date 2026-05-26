import { createHash } from "node:crypto";
import { openProject } from "../db/project.js";
import { relatedTests } from "../graph/relatedTests.js";
import { discoveryReadScore } from "./discoveryQuality.js";
import { findEntrypoints } from "./entrypoints.js";
import { findReusableComponents } from "./reuse.js";
import { chainConfidence, type DiscoveryChain, type EvidenceChainStep } from "./evidenceChain.js";

export interface TraceFeatureResult {
  task: string;
  chains: DiscoveryChain[];
  warnings: string[];
}

export function traceFeature(repoPath: string, task: string, limit = 5): TraceFeatureResult {
  const entrypoints = findEntrypoints(repoPath, task, limit).entrypoints;
  const reuse = findReusableComponents(repoPath, task, 5).reuseCandidates;
  const tests = relatedTests(
    repoPath,
    [...entrypoints.map((entry) => entry.path), ...reuse.map((hit) => hit.path)],
    task
  );
  const chains: DiscoveryChain[] = entrypoints.slice(0, limit).map((entry) => {
    const steps: EvidenceChainStep[] = [
      {
        type: entry.type,
        target: entry.path,
        why: entry.why,
        evidence: entry.evidence
      }
    ];
    for (const imported of importedFiles(repoPath, entry.path, task).slice(0, 3)) {
      steps.push({
        type: "implementation",
        target: imported,
        why: "Entrypoint imports or references this implementation file.",
        evidence: [{ type: "import_binding", detail: `${entry.path} imports ${imported}`, score: 0.78 }]
      });
    }
    const reuseHit = reuse.find((hit) => hit.path !== entry.path);
    if (reuseHit) {
      steps.push({
        type: "reuse_candidate",
        target: reuseHit.qualifiedName ? `${reuseHit.path}#${reuseHit.qualifiedName}` : reuseHit.path,
        why: reuseHit.why,
        evidence: [{ type: "reuse_similarity", detail: reuseHit.reuseType, score: reuseHit.similarity }]
      });
    }
    const test = tests.testFiles.find((file) => file.includes(pathStem(entry.path)) || file.includes("dashboard"));
    if (test) {
      steps.push({
        type: "test",
        target: test,
        why: "Related test for this feature chain.",
        evidence: [{ type: "test_coverage", detail: test, score: 0.8 }]
      });
    }
    const hasVerifiedImplementation = steps.some(
      (step) => step.type === "implementation" && targetMatchesTask(task, step.target)
    );
    const hasVerifiedTest = steps.some((step) => step.type === "test");
    const routeOrPage = entry.type.includes("route") || /Page|Screen|View/.test(entry.symbol ?? "");
    const chainType: DiscoveryChain["chainType"] =
      hasVerifiedImplementation && hasVerifiedTest && routeOrPage ? "verified_chain" : "candidate_chain";
    return {
      entrypoint: entry.symbol ?? entry.routePath ?? entry.path,
      chainType,
      path: steps,
      confidence: chainConfidence(steps)
    };
  });
  chains.sort(
    (a, b) =>
      Number(b.chainType === "verified_chain") - Number(a.chainType === "verified_chain") ||
      b.confidence - a.confidence ||
      a.entrypoint.localeCompare(b.entrypoint)
  );
  storeChains(repoPath, task, chains);
  return { task, chains, warnings: chains.length === 0 ? ["No discovery chain found."] : [] };
}

function importedFiles(repoPath: string, filePath: string, task: string): string[] {
  const project = openProject(repoPath);
  try {
    return (
      project.db
        .prepare(
          `SELECT rf.path
           FROM import_bindings b
           JOIN files f ON f.id = b.file_id
           JOIN files rf ON rf.id = b.resolved_file_id
           WHERE b.repo_id = ? AND f.path = ?
           ORDER BY b.confidence DESC, rf.path
           LIMIT 8`
        )
        .all(project.repo.id, filePath) as Array<{ path: string }>
    )
      .map((row) => ({
        path: row.path,
        score: discoveryReadScore(task, row.path, 0.78)
      }))
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .map((row) => row.path);
  } finally {
    project.db.close();
  }
}

function storeChains(repoPath: string, task: string, chains: DiscoveryChain[]): void {
  const project = openProject(repoPath);
  try {
    const stmt = project.db.prepare(
      "INSERT INTO discovery_chains (repo_id, task_hash, task, chain_json, confidence) VALUES (?, ?, ?, ?, ?)"
    );
    const taskHash = createHash("sha1").update(task).digest("hex");
    const insert = project.db.transaction(() => {
      for (const chain of chains) {
        stmt.run(project.repo.id, taskHash, task, JSON.stringify(chain), chain.confidence);
      }
    });
    insert();
  } finally {
    project.db.close();
  }
}

function pathStem(filePath: string): string {
  return filePath
    .split("/")
    .at(-1)!
    .replace(/\.[^.]+$/, "")
    .replace(/(_page|_widget|_screen|_view)$/, "");
}

function targetMatchesTask(task: string, target: string): boolean {
  const targetLower = target.toLowerCase();
  return task
    .toLowerCase()
    .split(/[^a-z0-9_\u4e00-\u9fff]+/u)
    .filter((token) => token.length > 2)
    .some((token) => targetLower.includes(token));
}
