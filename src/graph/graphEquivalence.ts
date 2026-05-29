import type { GraphSnapshot, GraphSnapshotSection } from "./graphSnapshot.js";

export interface EquivalenceDiff {
  missingInPartial: string[];
  extraInPartial: string[];
}

export interface EquivalenceResult {
  passed: boolean;
  mode: "partial_vs_full";
  mutationId: string;
  graphDiff: Partial<Record<GraphSnapshotSection, EquivalenceDiff>>;
  queryDiff: Record<string, unknown>;
  evidenceDiff: Record<string, unknown>;
  hardFailures: string[];
  allowedDifferences: string[];
}

const SNAPSHOT_SECTIONS: GraphSnapshotSection[] = [
  "files",
  "symbols",
  "importBindings",
  "routes",
  "tests",
  "codeBlocks",
  "symbolEdges"
];

export function compareGraphSnapshots(
  mutationId: string,
  partial: GraphSnapshot,
  full: GraphSnapshot,
  queryDiff: Record<string, unknown> = {},
  evidenceDiff: Record<string, unknown> = {}
): EquivalenceResult {
  const graphDiff: Partial<Record<GraphSnapshotSection, EquivalenceDiff>> = {};
  const hardFailures: string[] = [];
  for (const section of SNAPSHOT_SECTIONS) {
    const diff = compareKeyedItems(keysFor(partial, section), keysFor(full, section));
    if (diff.missingInPartial.length > 0 || diff.extraInPartial.length > 0) {
      graphDiff[section] = diff;
      if (section !== "codeBlocks") {
        hardFailures.push(`graph_${section}_diff`);
      }
    }
  }
  for (const [key, value] of Object.entries(queryDiff)) {
    if (hasDiffValue(value)) {
      hardFailures.push(`query_${key}_diff`);
    }
  }
  for (const [key, value] of Object.entries(evidenceDiff)) {
    if (hasDiffValue(value)) {
      hardFailures.push(`evidence_${key}_diff`);
    }
  }
  const uniqueFailures = Array.from(new Set(hardFailures));
  return {
    passed: uniqueFailures.length === 0,
    mode: "partial_vs_full",
    mutationId,
    graphDiff,
    queryDiff,
    evidenceDiff,
    hardFailures: uniqueFailures,
    allowedDifferences: ["coChangeGraph: stale_until_full_scan", "duplicateClusters: partial", "low-score tail order"]
  };
}

export function compareKeyedItems(partialKeys: string[], fullKeys: string[]): EquivalenceDiff {
  const partialSet = new Set(partialKeys);
  const fullSet = new Set(fullKeys);
  return {
    missingInPartial: fullKeys.filter((key) => !partialSet.has(key)),
    extraInPartial: partialKeys.filter((key) => !fullSet.has(key))
  };
}

function keysFor(snapshot: GraphSnapshot, section: GraphSnapshotSection): string[] {
  return snapshot[section].map((item) => ("key" in item ? item.key : item.path)).sort();
}

function hasDiffValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => hasDiffValue(item));
  }
  return Boolean(value);
}
