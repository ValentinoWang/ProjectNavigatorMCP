import type { GuardOutputAnalysis } from "../guard/analyzeGuardOutput.js";
import type { EditBoundaryV2 } from "./editBoundaryV2.js";
import type { MinimalRepairPath, MinimalRepairStep } from "./repairPathTypes.js";

export function buildMinimalRepairPath(input: {
  guardAnalysis: GuardOutputAnalysis | null;
  editBoundaryV2: EditBoundaryV2;
}): MinimalRepairPath {
  const steps: MinimalRepairStep[] = [];
  const warnings: string[] = [];
  const finding = input.guardAnalysis?.findings[0];
  const recipe = input.guardAnalysis?.ruleMatches[0];
  if (finding) {
    steps.push({
      order: steps.length + 1,
      action: "open",
      target: `${finding.file}${finding.line ? `:${finding.line}` : ""}`,
      tier: "must_edit",
      why: "Direct guard failure location."
    });
  }
  const canonical =
    recipe?.canonicalPaths.find((path) => !path.includes("scripts/quality/")) ??
    input.editBoundaryV2.mayInspectFiles[0];
  if (canonical) {
    steps.push({
      order: steps.length + 1,
      action: "inspect",
      target: canonical,
      tier: "may_inspect",
      why: recipe
        ? `Canonical source for ${recipe.ruleId}${recipe.subtype ? `/${recipe.subtype}` : ""}.`
        : "Canonical supporting file."
    });
  }
  if (finding) {
    steps.push({
      order: steps.length + 1,
      action: "edit",
      target: finding.file,
      tier: "must_edit",
      instruction:
        recipe?.preferredFixPatterns[0] ??
        recipe?.recipe.steps.find((step) => /replace|use|fix/i.test(step)) ??
        "Apply the smallest change that resolves the direct guard finding.",
      why: "Apply the guard recipe at the failing location."
    });
  }
  for (const command of (recipe?.validationCommands ?? input.guardAnalysis?.validationCommands ?? []).slice(0, 2)) {
    steps.push({
      order: steps.length + 1,
      action: "run",
      command,
      why: steps.some((step) => step.command === command) ? "Secondary validation." : "Guard validation command."
    });
  }
  if (steps.length < 3) {
    warnings.push("Not enough deterministic evidence to build a complete minimal repair path.");
  }
  return {
    steps: dedupeSteps(steps)
      .slice(0, 7)
      .map((step, index) => ({ ...step, order: index + 1 })),
    confidence: finding && recipe ? 0.92 : finding ? 0.72 : 0.45,
    warnings
  };
}

function dedupeSteps(steps: MinimalRepairStep[]): MinimalRepairStep[] {
  const seen = new Set<string>();
  return steps.filter((step) => {
    const key = `${step.action}:${step.target ?? step.command ?? step.instruction}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
