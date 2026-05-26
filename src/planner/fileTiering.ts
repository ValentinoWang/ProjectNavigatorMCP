import { matchesAnyPattern } from "../config/projectConfig.js";
import type { StoredSourceDoc } from "../docs/sourceDocQuery.js";
import type { GuardOutputAnalysis } from "../guard/analyzeGuardOutput.js";
import type { DomainDecision } from "./types.js";
import { findDomainRecipe } from "./domainRecipe.js";
import type { FileEditTier } from "./repairPathTypes.js";

export interface FileTier {
  path: string;
  tier: FileEditTier;
  reason: string;
  evidence: string[];
}

export function tierTaskFiles(input: {
  repoPath: string;
  sourceDoc: StoredSourceDoc | null;
  guardAnalysis: GuardOutputAnalysis | null;
  changedFiles: string[];
  domain: DomainDecision | null;
}): FileTier[] {
  const tiers: FileTier[] = [];
  const recipe = findDomainRecipe(input.repoPath, input.domain?.name);

  for (const finding of input.guardAnalysis?.findings ?? []) {
    tiers.push({
      path: finding.file,
      tier: "must_edit",
      reason: "Direct guard failure location.",
      evidence: ["direct_guard"]
    });
  }
  for (const file of input.changedFiles) {
    tiers.push({ path: file, tier: "must_edit", reason: "Explicit changed_files input.", evidence: ["changed_files"] });
  }
  for (const match of input.guardAnalysis?.ruleMatches ?? []) {
    for (const path of match.canonicalPaths) {
      tiers.push({
        path,
        tier: isGuardScript(path) ? "may_inspect" : "may_inspect",
        reason: `Guard recipe canonical path for ${match.ruleId}.`,
        evidence: ["guard_recipe"]
      });
    }
  }
  for (const target of input.sourceDoc?.targets ?? []) {
    const evidenceTier = target.evidenceTier ?? "fallback_keyword";
    if (target.kind === "depends_on") {
      tiers.push({
        path: target.targetPath,
        tier: "reference_only",
        reason: "source_doc depends_on.",
        evidence: [evidenceTier]
      });
      continue;
    }
    if (evidenceTier === "frontmatter_sync") {
      tiers.push({
        path: target.targetPath,
        tier: sourceDocTargetTier(target.targetPath, "may_edit"),
        reason: "frontmatter sync_target.",
        evidence: [evidenceTier]
      });
      continue;
    }
    if (target.kind === "validation_target") {
      tiers.push({
        path: target.targetPath,
        tier: sourceDocTargetTier(target.targetPath, "may_inspect"),
        reason: "source_doc validation target.",
        evidence: [evidenceTier]
      });
      continue;
    }
    tiers.push({
      path: target.targetPath,
      tier: "reference_only",
      reason: "inferred source_doc target.",
      evidence: [evidenceTier]
    });
  }
  if (recipe) {
    for (const pattern of recipe.defaultDoNotTouch) {
      tiers.push({
        path: pattern,
        tier: "do_not_touch",
        reason: `default do-not-touch for ${recipe.name}.`,
        evidence: ["domain_recipe"]
      });
    }
  }
  return mergeFileTiers(
    tiers.map((tier) => {
      if (recipe && matchesAnyPattern(tier.path, recipe.defaultDoNotTouch) && tier.tier !== "must_edit") {
        return { ...tier, tier: "do_not_touch" as const, reason: `${tier.reason} negative domain path.` };
      }
      return tier;
    })
  );
}

function mergeFileTiers(tiers: FileTier[]): FileTier[] {
  const best = new Map<string, FileTier>();
  for (const item of tiers) {
    const path = normalizePath(item.path);
    const existing = best.get(path);
    if (!existing || tierRank(item.tier) < tierRank(existing.tier)) {
      best.set(path, { ...item, path });
    } else if (existing) {
      existing.evidence = Array.from(new Set([...existing.evidence, ...item.evidence]));
    }
  }
  return Array.from(best.values());
}

function tierRank(tier: FileEditTier): number {
  return { must_edit: 0, may_edit: 1, may_inspect: 2, reference_only: 3, do_not_touch: 4 }[tier];
}

function isGuardScript(path: string): boolean {
  return /(^|\/)scripts\/quality\/.*guard.*\.(py|sh)$/.test(path);
}

function sourceDocTargetTier(path: string, editableDefault: FileEditTier): FileEditTier {
  if (isGuardScript(path)) {
    return "may_inspect";
  }
  if (isWeakReferencePath(path)) {
    return "reference_only";
  }
  return editableDefault;
}

function isWeakReferencePath(path: string): boolean {
  return /[*{}[\]]|screenshot|screen-shot|qa\/|\/qa|ocr|maestro|patrol|mobile/i.test(path);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/^\.\/+/, "").replaceAll("\\", "/");
}
