import { loadProjectConfig, matchesAnyPattern } from "../config/projectConfig.js";
import type { ReadOrderItem } from "../capsule/prepareTaskContext.js";
import type { DomainDecision, DomainGateDebug } from "./types.js";

export function applyDomainGate(input: {
  repoPath: string;
  domain: DomainDecision | null;
  readOrder: ReadOrderItem[];
  explicitPaths: string[];
}): { readOrder: ReadOrderItem[]; debug: DomainGateDebug } {
  const debug: DomainGateDebug = { demotedFiles: [], droppedCommands: [] };
  if (!input.domain) {
    return { readOrder: input.readOrder, debug };
  }
  const config = loadProjectConfig(input.repoPath);
  const gate = config.domainGates.find((item) => item.name === input.domain?.name);
  if (!gate) {
    return { readOrder: input.readOrder, debug };
  }
  const explicit = new Set(input.explicitPaths.map(normalizePath));
  const readOrder = input.readOrder
    .map((item) => {
      const path = normalizePath(item.path);
      if (explicit.has(path) && gate.allowNegativeWhenExplicit) {
        return item;
      }
      let multiplier = 1;
      let reason = "";
      if (matchesAnyPattern(path, gate.negativePaths)) {
        multiplier = 0.05;
        reason = `negative path for ${gate.name}`;
      } else if (
        gate.suppressGenericMarkdown &&
        /\.(md|markdown)$/i.test(path) &&
        !matchesAnyPattern(path, gate.positivePaths)
      ) {
        multiplier = 0.2;
        reason = `generic markdown outside ${gate.name}`;
      }
      if (multiplier === 1) {
        return item;
      }
      const demoted = { ...item, score: Number((item.score * multiplier).toFixed(4)), why: `${item.why}; ${reason}` };
      debug.demotedFiles.push({ path, fromScore: item.score, toScore: demoted.score, reason });
      return demoted;
    })
    .filter((item) => item.score >= 0.05 || explicit.has(normalizePath(item.path)))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { readOrder, debug };
}

export function commandDomainPenalty(command: string, domain: DomainDecision | null, repoPath: string): string | null {
  if (!domain) {
    return null;
  }
  const config = loadProjectConfig(repoPath);
  const gate = config.domainGates.find((item) => item.name === domain.name);
  if (!gate) {
    return null;
  }
  if (matchesAnyPattern(command, gate.negativeCommands)) {
    return `negative command for ${gate.name}`;
  }
  return null;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/^\.\/+/, "").replaceAll("\\", "/");
}
