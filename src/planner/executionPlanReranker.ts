import type { ExecutionPlanItem } from "../capsule/prepareTaskContext.js";
import type { GuardOutputAnalysis } from "../guard/analyzeGuardOutput.js";
import type { CommandHit } from "../graph/types.js";
import { commandDomainPenalty } from "./domainGate.js";
import type { DomainDecision, DomainGateDebug, RankedExecutionStep } from "./types.js";

export function rerankExecutionPlan(input: {
  repoPath: string;
  plan: ExecutionPlanItem[];
  guardAnalysis: GuardOutputAnalysis | null;
  domain: DomainDecision | null;
  recommendedCommands: CommandHit[];
  maxSteps?: number;
}): { plan: RankedExecutionStep[]; debug: Pick<DomainGateDebug, "droppedCommands"> } {
  const maxSteps = input.maxSteps ?? 8;
  const debug: Pick<DomainGateDebug, "droppedCommands"> = { droppedCommands: [] };
  const ranked = input.plan
    .map((step) => scoreStep(step, input))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const kept: RankedExecutionStep[] = [];
  for (const step of ranked) {
    if (!step.keep) {
      if (step.command) {
        debug.droppedCommands.push({
          command: step.command,
          reason: step.penalties.join("; ") || "low relevance",
          score: step.score
        });
      }
      continue;
    }
    kept.push(step);
    if (kept.length >= maxSteps) {
      break;
    }
  }

  return {
    plan: kept
      .sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase) || b.score - a.score)
      .map((step, index) => ({ ...step, order: index + 1 })),
    debug
  };
}

function scoreStep(
  step: ExecutionPlanItem,
  input: {
    repoPath: string;
    guardAnalysis: GuardOutputAnalysis | null;
    domain: DomainDecision | null;
    recommendedCommands: CommandHit[];
  }
): RankedExecutionStep {
  let score = 0.25;
  const penalties: string[] = [];
  const haystack = `${step.title} ${step.command ?? ""} ${step.targetPath ?? ""} ${step.why}`.toLowerCase();
  if (step.phase === "guard output" || step.why.includes("Direct guard failure")) {
    score += 1;
  }
  if (step.phase?.includes("frontmatter validation")) {
    score += 0.9;
  }
  if (/role[_-]visual|design[_-]system|design-token|magic-number|frontend-design/.test(haystack)) {
    score += 0.75;
  }
  if (/guard|lint|check|analyze/.test(haystack)) {
    score += 0.35;
  }
  if (/test|pytest|flutter test|vitest/.test(haystack)) {
    score += 0.25;
  }
  if (input.guardAnalysis?.ruleMatches.some((match) => match.validationCommands.includes(step.command ?? ""))) {
    score += 0.8;
  }
  const domainPenalty = step.command ? commandDomainPenalty(step.command, input.domain, input.repoPath) : null;
  if (domainPenalty) {
    score -= 0.75;
    penalties.push(domainPenalty);
  }
  if (
    /maestro|patrol|screenshot|mobile[-_ ]visual/.test(haystack) &&
    !/e2e|screenshot|截图|mobile|移动端/.test(haystackForTask(input))
  ) {
    score -= 0.8;
    penalties.push("mobile/e2e/screenshot command is not relevant to this task");
  }
  if (
    /all test|test all|npm test|flutter test(?!\s+\S)/.test(haystack) &&
    !/guard output|recommended validation/.test(step.phase ?? "")
  ) {
    score -= 0.35;
    penalties.push("broad test before narrow validation");
  }
  const keep = score >= 0.45 || step.phase === "guard output";
  return {
    ...step,
    phase: normalizePhase(step, score),
    score: Number(Math.max(0, Math.min(1.5, score)).toFixed(4)),
    keep,
    penalties
  };
}

function haystackForTask(input: { domain: DomainDecision | null }): string {
  return `${input.domain?.name ?? ""} ${input.domain?.evidence.join(" ") ?? ""}`.toLowerCase();
}

function normalizePhase(step: ExecutionPlanItem, score: number): ExecutionPlanItem["phase"] {
  if (step.phase === "guard output") {
    return "reproduce";
  }
  if (step.targetPath && !step.command) {
    return "inspect";
  }
  if (/guard|lint|check|analyze|test/.test(`${step.command ?? ""} ${step.title}`.toLowerCase())) {
    return score > 0.9 ? "narrow_validation" : "broad_validation";
  }
  return step.phase ?? "edit";
}

function phaseOrder(phase: string | null): number {
  const order = ["reproduce", "inspect", "edit", "narrow_validation", "broad_validation", "memory"];
  const index = order.indexOf(phase ?? "");
  return index >= 0 ? index : 99;
}
