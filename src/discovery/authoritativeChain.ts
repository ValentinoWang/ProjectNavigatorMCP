import type { FileHit } from "../graph/types.js";
import { decideReuseV2, type ReuseDecisionV2 } from "../reuse/reuseDecisionEngineV2.js";
import { findFlutterRouteToWidgetChain, type RouteToWidgetChain } from "../ui/flutterRouteChain.js";
import type { SimilarCodeHit } from "./types.js";
import { strictMustReadGate, type HandoffFile, type SuppressedCandidate } from "./strictMustReadGate.js";

export interface AuthoritativeHandoff {
  mode: "strict_discovery";
  confidence: number;
  chainStatus: RouteToWidgetChain["status"];
  chainDepth: number;
  chainCompleteness: RouteToWidgetChain["completeness"];
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
  warnings: string[];
}

export function buildAuthoritativeHandoff(
  repoPath: string,
  task: string,
  recommendedReadOrder: FileHit[],
  reuseCandidates: SimilarCodeHit[],
  relatedTests: { testFiles: string[] }
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
  const gate = strictMustReadGate(task, [...chainCandidates, ...readCandidates], reuseCandidates, 5);
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
    warnings: chain.warnings
  };
}
