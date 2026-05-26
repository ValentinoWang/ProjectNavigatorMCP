import { extractPathFromText, normalizeRepoPath } from "../docs/executionPlan.js";

export interface GuardFinding {
  file: string;
  line: number | null;
  column: number | null;
  rule: string | null;
  message: string;
  confidence: number;
}

export function parseGuardOutput(output: string, command?: string): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  const rule = inferRule(command, output);

  for (const line of lines) {
    const parsed = parseLine(line, rule);
    if (parsed) {
      findings.push(parsed);
    }
  }

  return dedupeFindings(findings);
}

function parseLine(line: string, rule: string | null): GuardFinding | null {
  const direct = line.match(
    /((?:\.\/)?(?:frontend|backend|scripts|src|docs|develop|tests|test|shared|database|\.github)\/[^\s:`'")]+):(\d+)(?::(\d+))?/
  );
  if (direct) {
    return {
      file: normalizeRepoPath(direct[1]),
      line: Number(direct[2]),
      column: direct[3] ? Number(direct[3]) : null,
      rule,
      message: cleanupMessage(line),
      confidence: 0.95
    };
  }

  const pathOnly = extractPathFromText(line);
  if (!pathOnly) {
    return null;
  }
  return {
    file: pathOnly,
    line: null,
    column: null,
    rule,
    message: cleanupMessage(line),
    confidence: 0.75
  };
}

function inferRule(command: string | undefined, output: string): string | null {
  const source = `${command ?? ""}\n${output}`;
  const script = source.match(/(?:check|run)_([A-Za-z0-9_ -]+?)(?:\.py|\.sh|\s|$)/)?.[1];
  if (script) {
    return script.replace(/-/g, "_");
  }
  const bracketed = output.match(/\[([A-Za-z0-9_-]+)\]/)?.[1];
  return bracketed ?? null;
}

function cleanupMessage(line: string): string {
  return line.trim().replace(/\s+/g, " ").slice(0, 500);
}

function dedupeFindings(findings: GuardFinding[]): GuardFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.file}:${finding.line ?? ""}:${finding.column ?? ""}:${finding.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
