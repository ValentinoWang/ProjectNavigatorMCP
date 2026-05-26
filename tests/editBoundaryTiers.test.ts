import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import type { StoredSourceDoc } from "../src/docs/sourceDocQuery.js";
import { tierTaskFiles } from "../src/planner/fileTiering.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyPlanGuardRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-boundary-v2-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("edit boundary v2", () => {
  it("keeps editable files separate from inspect-only and reference files", () => {
    const repo = copyPlanGuardRepo();
    const context = prepareTaskContext(repo, "role visual design system governance", {
      sourceDoc: "docs/plans/role_visual_system.md",
      guardOutput:
        "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart:9 [DS-BREAKPOINT] raw width is not allowed",
      guardCommand: "python scripts/quality/check_role_visual_system_guard.py",
      domainHint: "frontend_design_system"
    });

    expect(context.editBoundaryV2.mustEditFiles).toContain(
      "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart"
    );
    expect(context.editBoundaryV2.mayInspectFiles).toContain("scripts/quality/check_role_visual_system_guard.py");
    expect(context.editBoundaryV2.referenceOnlyFiles).toContain("docs/role-visual-system.md");
    expect(context.worktreeBoundary.allowedEditFiles).toEqual(
      expect.arrayContaining(context.editBoundaryV2.mustEditFiles)
    );
    expect(context.worktreeBoundary.allowedEditFiles).not.toContain(
      "scripts/quality/check_role_visual_system_guard.py"
    );
    expect(context.worktreeBoundary.allowedEditFiles).not.toContain("docs/role-visual-system.md");
  });

  it("keeps screenshot and wildcard source-doc targets reference-only", () => {
    const tiers = tierTaskFiles({
      repoPath: process.cwd(),
      sourceDoc: {
        path: "docs/plan.md",
        title: "Plan",
        ownerDomain: "frontend_design_system",
        authority: null,
        syncTargets: ["tests/screen-shot/Android", "scripts/quality/*guard*"],
        dependsOn: [],
        validation: [],
        targets: [
          {
            kind: "sync_target",
            targetPath: "tests/screen-shot/Android",
            confidence: 0.95,
            rawValue: "tests/screen-shot/Android",
            evidenceTier: "frontmatter_sync"
          },
          {
            kind: "sync_target",
            targetPath: "scripts/quality/*guard*",
            confidence: 0.95,
            rawValue: "scripts/quality/*guard*",
            evidenceTier: "frontmatter_sync"
          },
          {
            kind: "validation_target",
            targetPath: "scripts/qa/generate_mobile_android_screenshot_manifest.py",
            confidence: 0.25,
            rawValue: "scripts/qa/generate_mobile_android_screenshot_manifest.py",
            evidenceTier: "frontmatter_validation"
          }
        ],
        steps: [],
        parseMode: "frontmatter",
        docConfidence: 1,
        sourceWarnings: []
      } satisfies StoredSourceDoc,
      guardAnalysis: null,
      changedFiles: [],
      domain: { name: "frontend_design_system", confidence: 0.9, evidence: ["test"] }
    });

    expect(tiers.find((item) => item.path === "tests/screen-shot/Android")?.tier).toBe("reference_only");
    expect(tiers.find((item) => item.path === "scripts/quality/*guard*")?.tier).toBe("reference_only");
    expect(tiers.find((item) => item.path.includes("screenshot_manifest"))?.tier).toBe("reference_only");
  });
});
