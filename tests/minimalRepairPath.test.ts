import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyPlanGuardRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-minimal-repair-"));
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

describe("minimal repair path", () => {
  it("builds a short direct path for a design-system guard failure", () => {
    const repo = copyPlanGuardRepo();
    const context = prepareTaskContext(repo, "role visual design system governance", {
      sourceDoc: "docs/plans/role_visual_system.md",
      guardOutput:
        "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart:9 [DS-BREAKPOINT] raw width is not allowed",
      guardCommand: "python scripts/quality/check_role_visual_system_guard.py",
      domainHint: "frontend_design_system"
    });

    expect(context.minimalRepairPath.steps.length).toBeGreaterThanOrEqual(4);
    expect(context.minimalRepairPath.steps.length).toBeLessThanOrEqual(7);
    expect(context.minimalRepairPath.steps[0]).toMatchObject({
      action: "open",
      target: "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart:9"
    });
    expect(context.minimalRepairPath.steps.some((step) => step.target?.includes("experience_theme.dart"))).toBe(true);
    expect(context.minimalRepairPath.steps.some((step) => step.action === "edit")).toBe(true);
    expect(
      context.minimalRepairPath.steps.some((step) => step.command?.includes("check_role_visual_system_guard.py"))
    ).toBe(true);
    expect(context.minimalRepairPath.steps.some((step) => /maestro|patrol|screenshot/i.test(step.command ?? ""))).toBe(
      false
    );
  });
});
