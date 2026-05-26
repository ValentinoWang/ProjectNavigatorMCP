export interface GuardRecipe {
  title: string;
  steps: string[];
  validationCommands: string[];
  forbiddenPatterns?: string[];
  subtypes?: GuardRecipeSubtype[];
}

export interface GuardRecipeSubtype {
  id: string;
  match: GuardRuleMatcher;
  tokenHints: string[];
  canonicalSymbols?: string[];
  preferredFixPatterns: string[];
  forbiddenPatterns: string[];
}

export interface GuardRuleMatcher {
  commandContains?: string[];
  outputRegex?: string[];
  ruleIds?: string[];
}

export interface GuardRule {
  id: string;
  domain: string;
  severity: "info" | "warning" | "error";
  match: GuardRuleMatcher;
  canonicalPaths: string[];
  recipe: GuardRecipe;
}

export interface GuardRuleMatch {
  ruleId: string;
  subtype?: string | null;
  domain: string;
  severity: "info" | "warning" | "error";
  canonicalPaths: string[];
  recipe: GuardRecipe;
  validationCommands: string[];
  tokenHints: string[];
  preferredFixPatterns: string[];
  forbiddenPatterns: string[];
  confidence: number;
  evidence: string[];
}
