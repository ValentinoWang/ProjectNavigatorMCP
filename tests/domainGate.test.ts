import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-domain-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("domain gate", () => {
  it("keeps explicit frontend design-system files and demotes unrelated backend fallback files", () => {
    const repo = copyFixtureRepo();
    scanRepo(repo);
    const context = prepareTaskContext(repo, "Flutter design system breakpoint guard", {
      sourceDoc: "docs/plans/role_visual_system.md",
      guardOutput: "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart:9 [DS-BREAKPOINT] raw width",
      guardCommand: "bash scripts/quality/run_frontend_design_system_usage_guard.sh --mode ci",
      domainHint: "frontend_design_system",
      includeDebug: true
    });

    expect(context.domain?.name).toBe("frontend_design_system");
    expect(context.readOrder.slice(0, 3).map((item) => item.path)).toEqual([
      "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart",
      "frontend/lib/modules/design_system/theme/experience_theme.dart",
      "scripts/quality/check_role_visual_system_guard.py"
    ]);
    expect(context.readOrder.slice(0, 10).some((item) => item.path.startsWith("backend/"))).toBe(false);
    expect(context.executionPlan.length).toBeLessThanOrEqual(8);
  });
});
