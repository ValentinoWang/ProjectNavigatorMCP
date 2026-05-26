import type { EvidenceItem } from "./types.js";

export interface EvidenceChainStep {
  type: string;
  target: string;
  why: string;
  evidence: EvidenceItem[];
}

export interface DiscoveryChain {
  entrypoint: string;
  chainType: "verified_chain" | "candidate_chain";
  path: EvidenceChainStep[];
  confidence: number;
}

export function chainConfidence(steps: EvidenceChainStep[]): number {
  if (steps.length === 0) {
    return 0;
  }
  const evidenceScore =
    steps.reduce((total, step) => total + Math.min(1, step.evidence.length * 0.25), 0) / steps.length;
  const chainBonus = Math.min(0.3, steps.length * 0.06);
  return Number(Math.min(0.98, 0.35 + evidenceScore + chainBonus).toFixed(2));
}
