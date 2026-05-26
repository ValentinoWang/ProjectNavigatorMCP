import type { GuardRecipeSubtype, GuardRule, GuardRuleMatch } from "./guardRecipe.js";

export function matchRecipeSubtype(
  rule: GuardRule,
  input: { command?: string | null; output?: string | null }
): GuardRecipeSubtype | null {
  const subtypes = rule.recipe.subtypes ?? [];
  const scored = subtypes
    .map((subtype) => ({ subtype, score: scoreSubtype(subtype, input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.subtype.id.localeCompare(b.subtype.id));
  return scored[0]?.subtype ?? null;
}

export function enrichRuleMatchWithSubtype(match: GuardRuleMatch, subtype: GuardRecipeSubtype | null): GuardRuleMatch {
  if (!subtype) {
    return {
      ...match,
      tokenHints: match.tokenHints ?? [],
      preferredFixPatterns: match.preferredFixPatterns ?? [],
      forbiddenPatterns: match.forbiddenPatterns ?? match.recipe.forbiddenPatterns ?? []
    };
  }
  return {
    ...match,
    subtype: subtype.id,
    tokenHints: subtype.tokenHints,
    preferredFixPatterns: subtype.preferredFixPatterns,
    forbiddenPatterns: Array.from(new Set([...(match.recipe.forbiddenPatterns ?? []), ...subtype.forbiddenPatterns])),
    evidence: [...match.evidence, `subtype matched ${subtype.id}`]
  };
}

function scoreSubtype(subtype: GuardRecipeSubtype, input: { command?: string | null; output?: string | null }): number {
  const source = `${input.command ?? ""}\n${input.output ?? ""}`.toLowerCase();
  let score = 0;
  for (const pattern of subtype.match.outputRegex ?? []) {
    try {
      if (new RegExp(pattern, "i").test(source)) {
        score += 0.4;
      }
    } catch {
      if (source.includes(pattern.toLowerCase())) {
        score += 0.3;
      }
    }
  }
  for (const item of subtype.match.commandContains ?? []) {
    if ((input.command ?? "").toLowerCase().includes(item.toLowerCase())) {
      score += 0.25;
    }
  }
  return score;
}
