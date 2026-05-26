import { existsSync, readFileSync } from "node:fs";
import { openProject } from "../db/project.js";
import { getProjectPaths } from "../shared/paths.js";
import { DEFAULT_GUARD_RULES } from "./defaultRules.js";
import type { GuardRule, GuardRuleMatch } from "./guardRecipe.js";
import { enrichRuleMatchWithSubtype, matchRecipeSubtype } from "./recipeSubtype.js";

export interface GuardRuleRegistry {
  version: number;
  rules: GuardRule[];
}

export interface ExplainGuardRuleInput {
  rule?: string | null;
  command?: string | null;
  output?: string | null;
}

export function loadGuardRules(repoPath: string): GuardRule[] {
  const paths = getProjectPaths(repoPath);
  const customRules = existsSync(paths.guardRulesPath) ? readCustomRules(paths.guardRulesPath) : [];
  return dedupeRules([...customRules, ...DEFAULT_GUARD_RULES]);
}

export function explainGuardRule(repoPath: string, input: ExplainGuardRuleInput): GuardRuleMatch | null {
  const rules = loadGuardRules(repoPath);
  return matchGuardRule(rules, input);
}

export function matchGuardRule(rules: GuardRule[], input: ExplainGuardRuleInput): GuardRuleMatch | null {
  const candidates = rules
    .map((rule) => ({ rule, score: scoreRule(rule, input), evidence: ruleEvidence(rule, input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id));
  const best = candidates[0];
  if (!best) {
    return null;
  }
  const match: GuardRuleMatch = {
    ruleId: best.rule.id,
    subtype: null,
    domain: best.rule.domain,
    severity: best.rule.severity,
    canonicalPaths: best.rule.canonicalPaths,
    recipe: best.rule.recipe,
    validationCommands: best.rule.recipe.validationCommands,
    tokenHints: [],
    preferredFixPatterns: [],
    forbiddenPatterns: best.rule.recipe.forbiddenPatterns ?? [],
    confidence: Math.min(0.99, best.score),
    evidence: best.evidence
  };
  return enrichRuleMatchWithSubtype(match, matchRecipeSubtype(best.rule, input));
}

export function seedGuardRules(repoPath: string): number {
  const rules = loadGuardRules(repoPath);
  const project = openProject(repoPath);
  try {
    const upsert = project.db.prepare(
      `INSERT INTO guard_rules
        (repo_id, rule_id, domain, severity, matcher_json, canonical_paths_json, recipe_json, validation_commands_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(repo_id, rule_id) DO UPDATE SET
        domain = excluded.domain,
        severity = excluded.severity,
        matcher_json = excluded.matcher_json,
        canonical_paths_json = excluded.canonical_paths_json,
        recipe_json = excluded.recipe_json,
        validation_commands_json = excluded.validation_commands_json,
        updated_at = CURRENT_TIMESTAMP`
    );
    for (const rule of rules) {
      upsert.run(
        project.repo.id,
        rule.id,
        rule.domain,
        rule.severity,
        JSON.stringify(rule.match),
        JSON.stringify(rule.canonicalPaths),
        JSON.stringify(rule.recipe),
        JSON.stringify(rule.recipe.validationCommands)
      );
    }
    return rules.length;
  } finally {
    project.db.close();
  }
}

function readCustomRules(filePath: string): GuardRule[] {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<GuardRuleRegistry>;
    return Array.isArray(parsed.rules) ? parsed.rules.filter(isGuardRule) : [];
  } catch {
    return [];
  }
}

function isGuardRule(value: unknown): value is GuardRule {
  const candidate = value as GuardRule;
  return Boolean(candidate?.id && candidate.domain && candidate.match && candidate.recipe);
}

function dedupeRules(rules: GuardRule[]): GuardRule[] {
  const seen = new Map<string, GuardRule>();
  for (const rule of rules) {
    if (!seen.has(rule.id)) {
      seen.set(rule.id, rule);
    }
  }
  return Array.from(seen.values());
}

function scoreRule(rule: GuardRule, input: ExplainGuardRuleInput): number {
  const source = `${input.rule ?? ""}\n${input.command ?? ""}\n${input.output ?? ""}`.toLowerCase();
  let score = 0;
  if (input.rule && normalizeRuleId(input.rule) === normalizeRuleId(rule.id)) {
    score += 0.9;
  }
  for (const ruleId of rule.match.ruleIds ?? []) {
    if (input.rule && normalizeRuleId(input.rule) === normalizeRuleId(ruleId)) {
      score += 0.85;
    }
  }
  for (const item of rule.match.commandContains ?? []) {
    if ((input.command ?? "").toLowerCase().includes(item.toLowerCase())) {
      score += 0.35;
    }
  }
  for (const pattern of rule.match.outputRegex ?? []) {
    try {
      if (new RegExp(pattern, "i").test(source)) {
        score += pattern.length > 8 ? 0.35 : 0.2;
      }
    } catch {
      if (source.includes(pattern.toLowerCase())) {
        score += 0.25;
      }
    }
  }
  return Math.min(0.99, score);
}

function ruleEvidence(rule: GuardRule, input: ExplainGuardRuleInput): string[] {
  const source = `${input.rule ?? ""}\n${input.command ?? ""}\n${input.output ?? ""}`.toLowerCase();
  const evidence: string[] = [];
  if (input.rule && normalizeRuleId(input.rule) === normalizeRuleId(rule.id)) {
    evidence.push(`rule id matched ${rule.id}`);
  }
  for (const item of rule.match.commandContains ?? []) {
    if ((input.command ?? "").toLowerCase().includes(item.toLowerCase())) {
      evidence.push(`command contains ${item}`);
    }
  }
  for (const pattern of rule.match.outputRegex ?? []) {
    if (source.includes(pattern.toLowerCase())) {
      evidence.push(`output contains ${pattern}`);
    }
  }
  return evidence;
}

function normalizeRuleId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
