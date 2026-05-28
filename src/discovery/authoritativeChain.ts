import type { FileHit } from "../graph/types.js";
import { decideReuseV2, type ReuseDecisionV2 } from "../reuse/reuseDecisionEngineV2.js";
import { findFlutterRouteToWidgetChain, type RouteToWidgetChain } from "../ui/flutterRouteChain.js";
import type { SimilarCodeHit } from "./types.js";
import { strictMustReadGate, type HandoffFile, type SuppressedCandidate } from "./strictMustReadGate.js";
import type {
  WorkflowAction,
  WorkflowCommand,
  WorkflowDiscoveryProfile,
  WorkflowEditPolicy,
  WorkflowGateStep,
  WorkflowNewFileExpectation,
  WorkflowProtocol
} from "./workflowProfiles.js";

export interface AuthoritativeHandoff {
  mode: "strict_discovery";
  confidence: number;
  chainStatus: RouteToWidgetChain["status"];
  chainDepth: number;
  chainCompleteness: RouteToWidgetChain["completeness"];
  testCoverage?: RouteToWidgetChain["testCoverage"];
  mustRead: HandoffFile[];
  coreChain: RouteToWidgetChain["steps"];
  reuseDecision: ReuseDecisionV2;
  impactSummary: {
    affectedTests: string[];
    criticalFiles: string[];
  };
  supportingContext: HandoffFile[];
  suppressedCandidates: SuppressedCandidate[];
  strictGate: ReturnType<typeof strictMustReadGate>["strictGate"];
  workflowProtocol: WorkflowProtocol;
  warnings: string[];
}

export function buildAuthoritativeHandoff(
  repoPath: string,
  task: string,
  recommendedReadOrder: FileHit[],
  reuseCandidates: SimilarCodeHit[],
  relatedTests: { testFiles: string[] },
  workflowProfiles: WorkflowDiscoveryProfile[] = []
): AuthoritativeHandoff {
  const chain = findFlutterRouteToWidgetChain(repoPath, task);
  const chainCandidates = chain.steps.map((step) => ({
    path: step.path,
    score: step.confidence,
    role: step.kind,
    why: `${step.kind} in route-to-widget chain.`,
    evidence: step.evidence.map((item) => item.type)
  }));
  const readCandidates = recommendedReadOrder.slice(0, 15).map((file) => ({
    path: file.path,
    score: file.score,
    role: "ranked_candidate",
    why: file.reason,
    evidence: ["ranked_discovery"]
  }));
  const workflowCandidates = workflowProfiles.flatMap((profile) => profile.candidates);
  const gate = strictMustReadGate(
    task,
    [...workflowCandidates, ...chainCandidates, ...readCandidates],
    reuseCandidates,
    5
  );
  const reuseDecision = decideReuseV2(repoPath, task, 5, reuseCandidates);
  const confidence = Number(
    Math.min(
      0.98,
      chain.confidence * 0.55 + (gate.mustRead.length > 0 ? 0.25 : 0) + (reuseDecision.path ? 0.1 : 0)
    ).toFixed(2)
  );
  return {
    mode: "strict_discovery",
    confidence,
    chainStatus: chain.status,
    chainDepth: chain.depth,
    chainCompleteness: chain.completeness,
    testCoverage: chain.testCoverage,
    mustRead: gate.mustRead,
    coreChain: chain.steps,
    reuseDecision,
    impactSummary: {
      affectedTests: relatedTests.testFiles.slice(0, 5),
      criticalFiles: gate.mustRead.map((file) => file.path)
    },
    supportingContext: gate.supportingContext,
    suppressedCandidates: gate.suppressedCandidates,
    strictGate: gate.strictGate,
    workflowProtocol: buildWorkflowProtocol(workflowProfiles),
    warnings: Array.from(new Set([...chain.warnings, ...workflowProfiles.flatMap((profile) => profile.warnings)]))
  };
}

export function buildWorkflowProtocol(profiles: WorkflowDiscoveryProfile[]): WorkflowProtocol {
  return {
    profiles: profiles.map((profile) => ({
      name: profile.name,
      source: profile.source,
      confidence: profile.confidence
    })),
    actions: dedupeWorkflowItems(
      profiles.flatMap((profile) => profile.actions),
      actionKey
    ),
    recommendedCommands: dedupeWorkflowItems(
      profiles.flatMap((profile) => profile.recommendedCommands),
      (item) => item.command
    ),
    newFileExpectations: dedupeWorkflowItems(
      profiles.flatMap((profile) => profile.newFileExpectations),
      newFileKey
    ),
    editPolicies: dedupeWorkflowItems(
      profiles.flatMap((profile) => profile.editPolicies),
      (item) => `${item.policy}:${item.path}`
    ),
    gateSteps: dedupeWorkflowItems(
      profiles.flatMap((profile) => profile.gateSteps),
      (item) => item.id
    )
  };
}

function dedupeWorkflowItems<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function actionKey(item: WorkflowAction): string {
  return `${item.type}:${item.target ?? ""}:${item.path ?? ""}:${item.directory ?? ""}:${item.command ?? ""}`;
}

function newFileKey(item: WorkflowNewFileExpectation): string {
  return `${item.kind}:${item.path ?? ""}:${item.directory ?? ""}:${item.pattern ?? ""}`;
}
