import type { SimilarCodeHit } from "./types.js";
import { classifyDependencyTier, isNoisyDiscoveryPath, type DependencyTier } from "./dependencyTiers.js";
import { explainSuppression, type SuppressionReason } from "./suppressionReasons.js";

export interface StrictGateCandidate {
  path: string;
  score: number;
  role: string;
  why: string;
  evidence: string[];
  tier?: DependencyTier;
}

export interface HandoffFile {
  path: string;
  why: string;
  evidence: string[];
  role: string;
  confidence: number;
  reason?: SuppressionReason;
  reasonDetail?: string;
}

export interface SuppressedCandidate {
  path: string;
  reason: SuppressionReason;
  reasonDetail: string;
  downgradedTo: "shouldInspect" | "supportingContext" | "ignoreForNow";
  confidence: number;
  evidence: string[];
  score: number;
}

export interface StrictGateResult {
  mustRead: HandoffFile[];
  supportingContext: HandoffFile[];
  suppressedCandidates: SuppressedCandidate[];
  strictGate: {
    budget: { maxMustReadFiles: number; maxShouldInspectFiles: number };
    droppedFromMustRead: SuppressedCandidate[];
  };
}

export function strictMustReadGate(
  task: string,
  candidates: StrictGateCandidate[],
  reuseCandidates: SimilarCodeHit[] = [],
  maxMustReadFiles = 5
): StrictGateResult {
  const best = new Map<string, StrictGateCandidate>();
  for (const candidate of candidates) {
    const existing = best.get(candidate.path);
    if (!existing) {
      best.set(candidate.path, {
        ...candidate,
        tier: candidate.tier ?? classifyDependencyTier(task, candidate.path, candidate.evidence)
      });
    } else {
      best.set(candidate.path, {
        ...existing,
        score: Math.max(existing.score, candidate.score),
        why: existing.score >= candidate.score ? existing.why : candidate.why,
        role: existing.role === "ranked_candidate" ? candidate.role : existing.role,
        evidence: Array.from(new Set([...existing.evidence, ...candidate.evidence])),
        tier:
          existing.tier === "core_implementation" || candidate.tier === "core_implementation"
            ? "core_implementation"
            : (existing.tier ?? candidate.tier ?? classifyDependencyTier(task, candidate.path, candidate.evidence))
      });
    }
  }
  for (const reuse of reuseCandidates.filter((hit) => hit.verdict && hit.verdict !== "create_new_allowed")) {
    const existing = best.get(reuse.path);
    const candidate: StrictGateCandidate = {
      path: reuse.path,
      score: Math.max(existing?.score ?? 0, reuse.similarity),
      role: "required_reuse_candidate",
      why: reuse.suggestion ?? reuse.why,
      evidence: ["reuse_verdict", reuse.verdict ?? "reuse_candidate"],
      tier: "core_implementation"
    };
    best.set(reuse.path, candidate);
  }

  const mustRead: HandoffFile[] = [];
  const supportingContext: HandoffFile[] = [];
  const suppressedCandidates: SuppressedCandidate[] = [];

  for (const candidate of Array.from(best.values()).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))) {
    const tier = candidate.tier ?? classifyDependencyTier(task, candidate.path, candidate.evidence);
    const authoritative = candidate.evidence.some((item) =>
      /route_match|route_builds_page|page_composes_widget|widget_composes_widget|direct_target|reuse_verdict/.test(item)
    );
    const evidenceEnough = candidate.evidence.length >= 2 || authoritative;
    const testNoise = isNonTestTask(task) && /(^|\/)(test|tests)\//.test(candidate.path);
    const noisy = isNoisyDiscoveryPath(task, candidate.path) || testNoise;
    const canEnterMustRead =
      mustRead.length < maxMustReadFiles &&
      !noisy &&
      tier === "core_implementation" &&
      (candidate.score >= 0.72 || authoritative) &&
      evidenceEnough;
    if (canEnterMustRead) {
      mustRead.push({
        path: candidate.path,
        why: candidate.why,
        evidence: candidate.evidence,
        role: candidate.role,
        confidence: Number(candidate.score.toFixed(3))
      });
      continue;
    }
    const explanation = explainSuppression({
      task,
      path: candidate.path,
      tier,
      evidence: candidate.evidence,
      score: candidate.score,
      testNoise,
      noisy,
      evidenceEnough
    });
    if (tier === "supporting_dependency" || tier === "framework_dependency") {
      supportingContext.push({
        path: candidate.path,
        why: candidate.why,
        evidence: candidate.evidence,
        role: tier,
        confidence: Number(candidate.score.toFixed(3)),
        reason: explanation.reason,
        reasonDetail: explanation.detail
      });
      suppressedCandidates.push(suppressed(candidate, explanation));
    } else {
      suppressedCandidates.push(suppressed(candidate, explanation));
    }
  }

  return {
    mustRead,
    supportingContext: supportingContext.slice(0, 8),
    suppressedCandidates: suppressedCandidates.slice(0, 30),
    strictGate: {
      budget: { maxMustReadFiles, maxShouldInspectFiles: 8 },
      droppedFromMustRead: suppressedCandidates.slice(0, 30)
    }
  };
}

function isNonTestTask(task: string): boolean {
  return !/test|测试|guard|验收|ci|failure|失败/.test(task.toLowerCase());
}

function suppressed(
  candidate: StrictGateCandidate,
  explanation: ReturnType<typeof explainSuppression>
): SuppressedCandidate {
  return {
    path: candidate.path,
    reason: explanation.reason,
    reasonDetail: explanation.detail,
    downgradedTo: explanation.downgradedTo,
    confidence: explanation.confidence,
    evidence: candidate.evidence,
    score: Number(candidate.score.toFixed(3))
  };
}
