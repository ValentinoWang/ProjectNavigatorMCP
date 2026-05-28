import { createHash } from "node:crypto";
import { openProject } from "../db/project.js";
import { relatedTests } from "../graph/relatedTests.js";
import { discoveryReadScore } from "./discoveryQuality.js";
import { findEntrypoints } from "./entrypoints.js";
import { findReusableComponents } from "./reuse.js";
import { chainConfidence, type DiscoveryChain, type EvidenceChainStep } from "./evidenceChain.js";
import { findFlutterRouteToWidgetChain, type RouteToWidgetChain } from "../ui/flutterRouteChain.js";
import { buildWorkflowProtocol } from "./authoritativeChain.js";
import {
  resolveWorkflowDiscoveryProfiles,
  type WorkflowDiscoveryProfile,
  type WorkflowProtocol
} from "./workflowProfiles.js";

export interface TraceFeatureResult {
  task: string;
  mode: "route" | "workflow";
  routeToWidgetChainApplicability: "applicable" | "not_applicable";
  routeToWidgetChain: RouteToWidgetChain;
  workflowProtocol: WorkflowProtocol;
  workflowChain: EvidenceChainStep[];
  chains: DiscoveryChain[];
  warnings: string[];
}

export function traceFeature(repoPath: string, task: string, limit = 5): TraceFeatureResult {
  const workflowProfiles = resolveWorkflowDiscoveryProfiles(repoPath, task);
  if (workflowProfiles.length > 0) {
    return traceWorkflowFeature(repoPath, task, workflowProfiles, limit);
  }
  const entrypoints = findEntrypoints(repoPath, task, limit).entrypoints;
  const routeToWidgetChain = findFlutterRouteToWidgetChain(repoPath, task);
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
  return {
    task,
    mode: "route",
    routeToWidgetChainApplicability: "applicable",
    routeToWidgetChain,
    workflowProtocol: buildWorkflowProtocol([]),
    workflowChain: [],
    chains,
    warnings: chains.length === 0 ? ["No discovery chain found."] : []
  };
}

function traceWorkflowFeature(
  repoPath: string,
  task: string,
  workflowProfiles: WorkflowDiscoveryProfile[],
  limit: number
): TraceFeatureResult {
  const workflowProtocol = buildWorkflowProtocol(workflowProfiles);
  const workflowChain = workflowTraceSteps(workflowProfiles, limit);
  const chains: DiscoveryChain[] = workflowProfiles.map((profile) => {
    const profileSteps = workflowTraceSteps([profile], limit);
    return {
      entrypoint: profile.name,
      chainType: "verified_chain",
      path: profileSteps,
      confidence: Math.max(profile.confidence, chainConfidence(profileSteps))
    };
  });
  storeChains(repoPath, task, chains);
  return {
    task,
    mode: "workflow",
    routeToWidgetChainApplicability: "not_applicable",
    routeToWidgetChain: {
      status: "candidate_chain",
      steps: [],
      depth: 0,
      completeness: "route_page_only",
      confidence: 0,
      warnings: ["Route-to-widget chain is not applicable because a repo-local workflow profile matched this task."]
    },
    workflowProtocol,
    workflowChain,
    chains,
    warnings: Array.from(
      new Set([
        ...workflowProfiles.flatMap((profile) => profile.warnings),
        "trace-feature used repo-local workflow profile mode."
      ])
    )
  };
}

function workflowTraceSteps(profiles: WorkflowDiscoveryProfile[], limit: number): EvidenceChainStep[] {
  const steps: EvidenceChainStep[] = [];
  for (const profile of profiles) {
    for (const item of profile.readOrder.slice(0, limit)) {
      steps.push({
        type: "workflow_profile",
        target: item.path,
        why: item.reason,
        evidence: [{ type: "workflow_profile", detail: profile.name, score: item.score }]
      });
    }
    for (const command of profile.recommendedCommands.filter((item) => item.required).slice(0, 3)) {
      steps.push({
        type: "command",
        target: command.command,
        why: command.reason,
        evidence: [{ type: "workflow_recommended_command", detail: profile.name, score: profile.confidence }]
      });
    }
    for (const policy of profile.editPolicies.slice(0, 3)) {
      steps.push({
        type: "edit_policy",
        target: policy.path,
        why: `${policy.policy}: ${policy.reason}`,
        evidence: [{ type: "workflow_edit_policy", detail: profile.name, score: profile.confidence }]
      });
    }
    for (const step of profile.gateSteps.filter((item) => item.required).slice(0, 3)) {
      steps.push({
        type: "gate_step",
        target: step.command ?? step.id,
        why: step.description,
        evidence: [{ type: "workflow_gate_step", detail: profile.name, score: profile.confidence }]
      });
    }
  }
  return steps.slice(0, Math.max(limit, 1) * 4);
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
