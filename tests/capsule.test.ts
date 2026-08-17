import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { buildContextReceipt } from "../src/capsule/contextReceipt.js";
import { renderCapsule } from "../src/capsule/renderCapsule.js";
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

  it("keeps brief capsules within the read and output budget", () => {
    const repo = copyFixtureRepo();
    const context = prepareTaskContext(repo, "fix add test", { profile: "brief", includeDirtyStatus: false });
    const receipt = buildContextReceipt(context);
    const rendered = renderCapsule(context, "brief");
    const paths = receipt.read.map((item) => item.path);

    expect(context.profile).toBe("brief");
    expect(receipt.read.length).toBeLessThanOrEqual(5);
    expect(receipt.edit.must.length).toBeLessThanOrEqual(3);
    expect(receipt.edit.may.length).toBeLessThanOrEqual(2);
    expect(receipt.validate.length).toBeLessThanOrEqual(3);
    expect(receipt.warnings.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(receipt).length).toBeLessThanOrEqual(2500);
    expect(new Set(paths).size).toBe(paths.length);
    expect(context.projectRules).toEqual([]);
    expect(context.memoryHits).toEqual([]);
    expect(context.debug).toBeNull();
    expect(rendered.length).toBeLessThanOrEqual(2500);
    expect(rendered).not.toContain("## Edit Boundary V2");
    expect(rendered).not.toContain("## Memory Hits");
  });

  it("keeps direct guard repairs out of broad discovery planes", () => {
    const repo = copyFixtureRepo();
    const context = prepareTaskContext(repo, "fix add test", {
      profile: "brief",
      guardOutput: "src/main.ts:1 add rule failure",
      includeDirtyStatus: false
    });

    expect(context.mode).toBe("repair");
    expect(context.discovery).toBeNull();
    expect(context.symbols).toEqual([]);
    expect(context.routes).toEqual([]);
    expect(context.relatedFiles).not.toContainEqual(expect.objectContaining({ path: "test/main.test.ts" }));
    expect(context.readOrder[0]?.path).toBe("src/main.ts");
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
    expect(context.domain?.name).toBe("frontend_design_system");
    expect(context.guardRecipes[0]?.recipe.steps.length).toBeGreaterThan(0);
    expect(context.executionPlan.length).toBeLessThanOrEqual(8);
    expect(context.executionPlan.some((item) => item.command?.includes("check_design_system_usage_guard.py"))).toBe(
      true
    );
    expect(context.worktreeBoundary.allowedEditFiles).toContain(
      "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart"
    );
    expect(context.editBoundary.preferredFiles).toContain(
      "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart"
    );
  });
});
