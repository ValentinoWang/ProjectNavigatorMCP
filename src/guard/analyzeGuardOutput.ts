import { loadSourceDoc } from "../docs/sourceDocQuery.js";
import { parseGuardOutput, type GuardFinding } from "./guardOutputParser.js";
import type { GuardRuleMatch } from "./guardRecipe.js";
import { explainGuardRule } from "./ruleRegistry.js";

export interface GuardOutputAnalysis {
  tool: string | null;
  command: string | null;
  findings: GuardFinding[];
  ruleMatches: GuardRuleMatch[];
  likelyFixFiles: Array<{
    path: string;
    line?: number | null;
    why: string;
    score: number;
  }>;
  suggestedActions: string[];
  validationCommands: string[];
  warnings: string[];
}

export function analyzeGuardOutput(
  repoPath: string,
  output: string,
  options: { command?: string; sourceDoc?: string } = {}
): GuardOutputAnalysis {
  const findings = parseGuardOutput(output, options.command);
  const ruleMatches = dedupeRuleMatches(
    findings
      .map((finding) =>
        explainGuardRule(repoPath, {
          rule: finding.rule,
          command: options.command,
          output: `${finding.message}\n${output}`
        })
      )
      .filter((match): match is GuardRuleMatch => match !== null)
  );
  const enrichedFindings = enrichFindings(findings, ruleMatches);
  const warnings: string[] = [];
  const likelyFixFiles = enrichedFindings.map((finding) => ({
    path: finding.file,
    line: finding.line,
    why: "Direct guard failure location",
    score: 1
  }));
  for (const match of ruleMatches) {
    for (const canonicalPath of match.canonicalPaths) {
      likelyFixFiles.push({
        path: canonicalPath,
        line: null,
        why: `Guard recipe canonical path for ${match.ruleId}`,
        score: 0.97
      });
    }
  }

  let validationCommands = options.command ? [options.command] : [];
  validationCommands.push(...ruleMatches.flatMap((match) => match.validationCommands));
  if (options.sourceDoc) {
    const sourceDoc = loadSourceDoc(repoPath, options.sourceDoc);
    if (sourceDoc.warning) {
      warnings.push(sourceDoc.warning);
    }
    if (sourceDoc.doc) {
      for (const target of sourceDoc.doc.targets) {
        if (target.kind === "sync_target") {
          likelyFixFiles.push({
            path: target.targetPath,
            line: null,
            why: "Explicit source_doc sync_target",
            score: 0.95
          });
        }
      }
      validationCommands = [
        ...validationCommands,
        ...sourceDoc.doc.validation,
        ...sourceDoc.doc.steps.map((step) => step.command).filter((command): command is string => Boolean(command))
      ];
    }
  }

  return {
    tool: inferTool(options.command, findings),
    command: options.command ?? null,
    findings: enrichedFindings,
    ruleMatches,
    likelyFixFiles: dedupeFiles(likelyFixFiles),
    suggestedActions: suggestedActions(enrichedFindings.length > 0, ruleMatches),
    validationCommands: Array.from(new Set(validationCommands)),
    warnings
  };
}

function inferTool(command: string | undefined, findings: GuardFinding[]): string | null {
  return (
    findings.find((finding) => finding.rule)?.rule ??
    command?.split(/\s+/).find((part) => part.includes("guard")) ??
    null
  );
}

function suggestedActions(hasFindings: boolean, ruleMatches: GuardRuleMatch[]): string[] {
  if (!hasFindings) {
    return ["No file:line findings were detected. Re-run the guard with full output if the failure is still unclear."];
  }
  const recipeSteps = ruleMatches.flatMap((match) => match.recipe.steps).slice(0, 5);
  return [
    "Open the failing file and line first.",
    "Check explicit source_doc sync_targets for the canonical API or guard rule.",
    ...recipeSteps,
    "Edit the smallest file set that addresses the direct finding.",
    "Re-run the same guard before broader validation."
  ];
}

function enrichFindings(findings: GuardFinding[], matches: GuardRuleMatch[]): GuardFinding[] {
  const best = matches[0];
  return findings.map((finding) => ({
    ...finding,
    ruleId: best?.ruleId ?? finding.rule,
    domain: best?.domain ?? null
  }));
}

function dedupeRuleMatches(matches: GuardRuleMatch[]): GuardRuleMatch[] {
  const best = new Map<string, GuardRuleMatch>();
  for (const match of matches) {
    const existing = best.get(match.ruleId);
    if (!existing || match.confidence > existing.confidence) {
      best.set(match.ruleId, match);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.confidence - a.confidence);
}

function dedupeFiles(files: GuardOutputAnalysis["likelyFixFiles"]): GuardOutputAnalysis["likelyFixFiles"] {
  const best = new Map<string, GuardOutputAnalysis["likelyFixFiles"][number]>();
  for (const file of files) {
    const existing = best.get(file.path);
    if (!existing || file.score > existing.score) {
      best.set(file.path, file);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}
