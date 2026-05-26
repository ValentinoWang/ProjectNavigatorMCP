import path from "node:path";
import { parseMarkdownDocument, type SourceDocFrontmatter } from "./frontmatter.js";

export interface SourceDocumentAnalysis {
  path: string;
  title: string | null;
  ownerDomain?: string;
  authority?: string;
  frontmatter: SourceDocFrontmatter;
  parseMode: "frontmatter" | "inferred" | "mixed";
  docConfidence: number;
  warnings: string[];
  targets: SourceDocumentTarget[];
  steps: SourceDocumentStep[];
  summary: string | null;
}

export interface SourceDocumentTarget {
  kind: "sync_target" | "depends_on" | "validation_target";
  targetPath: string;
  confidence: number;
  rawValue: string;
}

export interface SourceDocumentStep {
  phase: string | null;
  ordinal: number;
  title: string | null;
  command: string | null;
  targetPath: string | null;
  category: "guard" | "test" | "edit" | "step";
  rawText: string;
  confidence: number;
}

export function analyzeSourceDocument(filePath: string, content: string): SourceDocumentAnalysis {
  const parsed = parseMarkdownDocument(content);
  const steps = extractSteps(parsed.body, parsed.frontmatter.validation);
  const frontmatterTargets = buildTargets(filePath, parsed.frontmatter);
  const inferredTargets = inferTargets(filePath, parsed.body);
  const hasFrontmatterSignals =
    parsed.frontmatter.syncTargets.length > 0 ||
    parsed.frontmatter.dependsOn.length > 0 ||
    parsed.frontmatter.validation.length > 0;
  const hasInferredSignals = inferredTargets.length > 0;
  const parseMode =
    hasFrontmatterSignals && hasInferredSignals ? "mixed" : hasFrontmatterSignals ? "frontmatter" : "inferred";
  const warnings =
    parseMode === "inferred"
      ? ["source_doc has no structured frontmatter; paths and commands were inferred from Markdown body."]
      : [];
  return {
    path: normalizeRepoPath(filePath),
    title: parsed.title,
    ownerDomain: parsed.frontmatter.ownerDomain,
    authority: parsed.frontmatter.authority,
    frontmatter: parsed.frontmatter,
    parseMode,
    docConfidence: parseMode === "frontmatter" ? 1 : parseMode === "mixed" ? 0.85 : 0.55,
    warnings,
    targets: dedupeTargets([...frontmatterTargets, ...inferredTargets]),
    steps,
    summary: firstParagraph(parsed.body)
  };
}

function inferTargets(docPath: string, body: string): SourceDocumentTarget[] {
  const targets: SourceDocumentTarget[] = [];
  let currentHeading = "";
  for (const rawLine of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(/^#{2,4}\s+(.+)$/);
    if (heading) {
      currentHeading = heading[1].trim();
      continue;
    }
    const context = `${currentHeading} ${line}`.toLowerCase();
    const path = extractPathFromText(line);
    if (!path) {
      continue;
    }
    if (/sync|同步|must update|必须同步|目标文件|target/.test(context)) {
      targets.push({
        kind: "sync_target",
        targetPath: resolveDocumentPath(docPath, path),
        confidence: 0.62,
        rawValue: line
      });
    } else if (/validation|validate|验收|guard|校验|命令/.test(context)) {
      targets.push({ kind: "validation_target", targetPath: path, confidence: 0.55, rawValue: line });
    } else if (/depends|依赖|相关/.test(context)) {
      targets.push({
        kind: "depends_on",
        targetPath: resolveDocumentPath(docPath, path),
        confidence: 0.5,
        rawValue: line
      });
    }
  }
  return targets;
}

function buildTargets(docPath: string, frontmatter: SourceDocFrontmatter): SourceDocumentTarget[] {
  const targets: SourceDocumentTarget[] = [];
  for (const targetPath of frontmatter.syncTargets) {
    targets.push({
      kind: "sync_target",
      targetPath: resolveDocumentPath(docPath, targetPath),
      confidence: 0.95,
      rawValue: targetPath
    });
  }
  for (const targetPath of frontmatter.dependsOn) {
    targets.push({
      kind: "depends_on",
      targetPath: resolveDocumentPath(docPath, targetPath),
      confidence: 0.75,
      rawValue: targetPath
    });
  }
  for (const command of frontmatter.validation) {
    const targetPath = extractPathFromText(command);
    if (targetPath) {
      targets.push({ kind: "validation_target", targetPath, confidence: 0.85, rawValue: command });
    }
  }
  return dedupeTargets(targets);
}

function extractSteps(body: string, validationCommands: string[]): SourceDocumentStep[] {
  const steps: SourceDocumentStep[] = [];
  let currentPhase: string | null = null;
  let ordinal = 0;
  let inFence = false;
  let fenceLanguage = "";

  for (const rawLine of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(/^#{2,4}\s+(.+)$/);
    if (heading) {
      currentPhase = heading[1].trim();
      continue;
    }
    const fence = line.match(/^```([A-Za-z0-9_-]*)/);
    if (fence) {
      inFence = !inFence;
      fenceLanguage = inFence ? fence[1] : "";
      continue;
    }
    if (inFence && (fenceLanguage === "bash" || fenceLanguage === "sh" || looksLikeCommand(line))) {
      const command = line.replace(/^\$\s*/, "").trim();
      if (command) {
        steps.push(step(currentPhase, ++ordinal, command, command));
      }
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet && shouldKeepBulletStep(currentPhase, bullet[1])) {
      const text = bullet[1].trim();
      const inlineCommand = extractInlineCommand(text);
      steps.push(step(currentPhase, ++ordinal, text, inlineCommand ?? (looksLikeCommand(text) ? text : null)));
    }
  }

  for (const command of validationCommands) {
    steps.push(step("frontmatter validation", ++ordinal, command, command, 0.95));
  }

  return steps;
}

function step(
  phase: string | null,
  ordinal: number,
  rawText: string,
  command: string | null,
  confidence = 0.7
): SourceDocumentStep {
  return {
    phase,
    ordinal,
    title: command ? null : rawText.slice(0, 120),
    command,
    targetPath: command ? extractPathFromText(command) : extractPathFromText(rawText),
    category: command ? categoryForCommand(command) : "step",
    rawText,
    confidence
  };
}

function looksLikeCommand(text: string): boolean {
  return /^(make|npm|pnpm|yarn|python|python3|pytest|bash|sh|flutter|dart|cd)\b/.test(text);
}

function extractInlineCommand(text: string): string | null {
  const matches = Array.from(text.matchAll(/`([^`]+)`/g)).map((match) => match[1].trim());
  return matches.find((match) => looksLikeCommand(match) || /^scripts\/.+/.test(match)) ?? null;
}

function categoryForCommand(command: string): SourceDocumentStep["category"] {
  if (/guard|lint|check|analyze/.test(command)) {
    return "guard";
  }
  if (/test|vitest|pytest|flutter test/.test(command)) {
    return "test";
  }
  return "step";
}

export function extractPathFromText(text: string): string | null {
  const match = text.match(
    /((?:\.\/)?(?:frontend|backend|scripts|src|docs|develop|tests|test|shared|database|\.github)\/[^\s:`'")]+)/
  );
  if (!match) {
    return null;
  }
  return normalizeRepoPath(match[1]);
}

export function normalizeRepoPath(value: string): string {
  return path.posix.normalize(
    value
      .replace(/^\.\/+/, "")
      .split(path.sep)
      .join("/")
  );
}

function resolveDocumentPath(docPath: string, value: string): string {
  const normalizedValue = value.split(path.sep).join("/");
  if (isRepoRootPath(normalizedValue)) {
    return normalizeRepoPath(normalizedValue);
  }
  return normalizeRepoPath(path.posix.join(path.posix.dirname(normalizeRepoPath(docPath)), normalizedValue));
}

function isRepoRootPath(value: string): boolean {
  return /^(frontend|backend|scripts|src|docs|develop|tests|test|shared|database|\.github)\//.test(value);
}

function shouldKeepBulletStep(phase: string | null, text: string): boolean {
  if (looksLikeCommand(text)) {
    return true;
  }
  return Boolean(phase && /phase|验收|validation|review checklist|checklist|实施|计划/i.test(phase));
}

function dedupeTargets(targets: SourceDocumentTarget[]): SourceDocumentTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.kind}:${target.targetPath}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function firstParagraph(body: string): string | null {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((item) => item.replace(/^#+\s+.+$/gm, "").trim())
    .find((item) => item.length > 0);
  return paragraph ? paragraph.slice(0, 500) : null;
}
