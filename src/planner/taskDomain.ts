import { loadProjectConfig, matchesAnyPattern } from "../config/projectConfig.js";
import type { GuardOutputAnalysis } from "../guard/analyzeGuardOutput.js";
import type { StoredSourceDoc } from "../docs/sourceDocQuery.js";
import type { DomainDecision } from "./types.js";
import { findDomainRecipe } from "./domainRecipe.js";

export function inferTaskDomain(input: {
  repoPath: string;
  task: string;
  domainHint?: string;
  sourceDoc: StoredSourceDoc | null;
  guardAnalysis: GuardOutputAnalysis | null;
  changedFiles: string[];
}): DomainDecision | null {
  const config = loadProjectConfig(input.repoPath);
  const evidence: string[] = [];
  const hinted = input.domainHint ?? input.guardAnalysis?.ruleMatches[0]?.domain ?? input.sourceDoc?.ownerDomain;
  if (hinted) {
    const recipe = findDomainRecipe(input.repoPath, hinted);
    evidence.push(`explicit domain signal: ${hinted}`);
    return { name: recipe?.name ?? hinted, confidence: 0.95, evidence };
  }

  const source = `${input.task} ${input.sourceDoc?.title ?? ""} ${input.sourceDoc?.authority ?? ""}`.toLowerCase();
  const scored = config.domainGates
    .map((gate) => {
      let score = 0;
      const gateEvidence: string[] = [];
      for (const keyword of gate.keywords) {
        if (source.includes(keyword.toLowerCase())) {
          score += 0.18;
          gateEvidence.push(`keyword:${keyword}`);
        }
      }
      for (const file of input.changedFiles) {
        if (matchesAnyPattern(file, gate.positivePaths)) {
          score += 0.2;
          gateEvidence.push(`changed_file:${file}`);
        }
      }
      for (const finding of input.guardAnalysis?.findings ?? []) {
        if (matchesAnyPattern(finding.file, gate.positivePaths)) {
          score += 0.25;
          gateEvidence.push(`guard_file:${finding.file}`);
        }
      }
      return { gate, score, evidence: gateEvidence };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return null;
  }
  return {
    name: best.gate.name,
    confidence: Math.min(0.92, best.score),
    evidence: best.evidence
  };
}
