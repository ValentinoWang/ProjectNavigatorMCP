import { readRepoTextFile } from "./fileScanner.js";
import type { ScannedRule } from "./types.js";

const RULE_SOURCE_CANDIDATES = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/README.md",
  "docs/CONVENTIONS.md",
  "frontend/README.md",
  "backend/README.md"
];

export function scanRules(repoRoot: string): ScannedRule[] {
  const rules: ScannedRule[] = [];
  for (const sourceFile of RULE_SOURCE_CANDIDATES) {
    const content = readRepoTextFile(repoRoot, sourceFile);
    if (!content) {
      continue;
    }
    rules.push(...extractRules(sourceFile, content));
  }
  return rules.slice(0, 300);
}

function extractRules(sourceFile: string, content: string): ScannedRule[] {
  const lines = content.split(/\r?\n/);
  const rules: ScannedRule[] = [];
  let currentTitle: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      currentTitle = heading[1].trim();
      continue;
    }
    if (/^[-*]\s+/.test(line) || /\b(must|should|never|do not|prefer|不要|必须|禁止|优先|建议)\b/i.test(line)) {
      rules.push({
        sourceFile,
        title: currentTitle,
        body: line.replace(/^[-*]\s+/, ""),
        category: categorizeRule(line)
      });
    }
  }
  return rules;
}

function categorizeRule(line: string): string {
  const lowered = line.toLowerCase();
  if (lowered.includes("test") || lowered.includes("测试")) {
    return "test";
  }
  if (lowered.includes("frontend") || lowered.includes("flutter") || lowered.includes("ui")) {
    return "frontend";
  }
  if (lowered.includes("backend") || lowered.includes("api") || lowered.includes("schema")) {
    return "backend";
  }
  if (lowered.includes("do not") || lowered.includes("never") || lowered.includes("禁止") || lowered.includes("不要")) {
    return "constraint";
  }
  return "general";
}
