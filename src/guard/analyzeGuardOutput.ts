import { loadSourceDoc } from "../docs/sourceDocQuery.js";
import { parseGuardOutput, type GuardFinding } from "./guardOutputParser.js";

export interface GuardOutputAnalysis {
  tool: string | null;
  command: string | null;
  findings: GuardFinding[];
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
  const warnings: string[] = [];
  const likelyFixFiles = findings.map((finding) => ({
    path: finding.file,
    line: finding.line,
    why: "Direct guard failure location",
    score: 1
  }));

  let validationCommands = options.command ? [options.command] : [];
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
    findings,
    likelyFixFiles: dedupeFiles(likelyFixFiles),
    suggestedActions: suggestedActions(findings.length > 0),
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

function suggestedActions(hasFindings: boolean): string[] {
  if (!hasFindings) {
    return ["No file:line findings were detected. Re-run the guard with full output if the failure is still unclear."];
  }
  return [
    "Open the failing file and line first.",
    "Check explicit source_doc sync_targets for the canonical API or guard rule.",
    "Edit the smallest file set that addresses the direct finding.",
    "Re-run the same guard before broader validation."
  ];
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
