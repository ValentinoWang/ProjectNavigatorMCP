import type { FileTier } from "./fileTiering.js";

export interface EditBoundaryV2 {
  mustEditFiles: string[];
  mayEditFiles: string[];
  mayInspectFiles: string[];
  referenceOnlyFiles: string[];
  doNotTouchFiles: string[];
  warnings: string[];
}

export function buildEditBoundaryV2(tiers: FileTier[]): EditBoundaryV2 {
  const boundary: EditBoundaryV2 = {
    mustEditFiles: filesByTier(tiers, "must_edit"),
    mayEditFiles: filesByTier(tiers, "may_edit"),
    mayInspectFiles: filesByTier(tiers, "may_inspect"),
    referenceOnlyFiles: filesByTier(tiers, "reference_only"),
    doNotTouchFiles: filesByTier(tiers, "do_not_touch"),
    warnings: []
  };
  if (boundary.mayInspectFiles.some((file) => file.includes("scripts/quality/"))) {
    boundary.warnings.push("Guard scripts are inspect-only unless the task explicitly asks to change guard rules.");
  }
  if (boundary.doNotTouchFiles.length > 0) {
    boundary.warnings.push(
      "Do not touch negative-domain or pre-existing dirty files unless scope is explicitly expanded."
    );
  }
  return boundary;
}

function filesByTier(tiers: FileTier[], tier: FileTier["tier"]): string[] {
  return Array.from(new Set(tiers.filter((item) => item.tier === tier).map((item) => item.path)));
}
