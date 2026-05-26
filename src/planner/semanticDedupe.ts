import type { ExecutionPlanItem } from "../capsule/prepareTaskContext.js";
import { normalizeCommand } from "./commandNormalize.js";

export interface DedupeDebugItem {
  kept: string;
  removed: string;
  reason: string;
}

export function semanticDedupePlanItems<T extends ExecutionPlanItem>(
  items: T[]
): { items: T[]; deduped: DedupeDebugItem[] } {
  const best = new Map<string, T>();
  const deduped: DedupeDebugItem[] = [];
  for (const item of items) {
    const key = semanticKey(item);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, item);
      continue;
    }
    existing.why = mergeWhy(existing.why, item.why);
    deduped.push({ kept: existing.title, removed: item.title, reason: `semantic duplicate ${key}` });
  }
  return { items: Array.from(best.values()), deduped };
}

function semanticKey(item: ExecutionPlanItem): string {
  if (item.command) {
    return `cmd:${normalizeCommand(item.command)}`;
  }
  if (item.targetPath) {
    return `target:${item.targetPath}`;
  }
  return `title:${item.title.toLowerCase().replace(/\s+/g, " ")}`;
}

function mergeWhy(a: string, b: string): string {
  if (a.includes(b)) {
    return a;
  }
  return `${a} Also: ${b}`;
}
