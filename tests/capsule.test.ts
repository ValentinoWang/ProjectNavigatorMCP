import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { rememberTask, searchProjectMemory } from "../src/memory/memory.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-capsule-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/tiny-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("prepareTaskContext", () => {
  it("returns files, commands, rules, and next steps", () => {
    const repo = copyFixtureRepo();
    const context = prepareTaskContext(repo, "fix add test");

    expect(context.likelyFiles.length).toBeGreaterThan(0);
    expect(context.recommendedCommands.length).toBeGreaterThan(0);
    expect(context.projectRules.length).toBeGreaterThan(0);
    expect(context.nextSteps.length).toBeGreaterThan(0);
  });

  it("stores and retrieves project memory", () => {
    const repo = copyFixtureRepo();
    const stored = rememberTask(repo, {
      title: "fix add test",
      summary: "Changed add behavior and ran vitest.",
      changedFiles: ["src/main.ts"],
      tests: ["npm run test"]
    });

    expect(stored.stored).toBe(true);
    const memories = searchProjectMemory(repo, "add vitest");
    expect(memories[0]?.topic).toBe("fix add test");
  });

  it("prioritizes guard findings and source_doc sync targets over generic markdown", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pnav-plan-capsule-"));
    tempDirs.push(root);
    cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });
    scanRepo(root);

    const context = prepareTaskContext(root, "role visual design system governance", {
      sourceDoc: "docs/plans/role_visual_system.md",
      guardOutput:
        "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart:9\nPrivate role palette usage is not allowed.",
      guardCommand: "python scripts/quality/check_role_visual_system_guard.py"
    });

    expect(context.readOrder[0]?.path).toBe("frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart");
    expect(context.readOrder.slice(0, 5).map((item) => item.path)).toContain(
      "scripts/quality/check_role_visual_system_guard.py"
    );
    expect(context.readOrder.slice(0, 5).map((item) => item.path)).toContain(
      "frontend/lib/modules/design_system/theme/experience_theme.dart"
    );
    expect(context.readOrder.slice(0, 3).map((item) => item.path)).not.toContain("docs/noisy/unrelated.md");
    expect(context.executionPlan.some((item) => item.command?.includes("check_design_system_usage_guard.py"))).toBe(
      true
    );
    expect(context.editBoundary.preferredFiles).toContain(
      "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart"
    );
  });
});
