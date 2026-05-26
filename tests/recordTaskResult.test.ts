import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { recordTaskResult } from "../src/memory/recordTaskResult.js";
import { searchProjectMemory } from "../src/memory/memory.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("recordTaskResult", () => {
  it("stores guard rule, changed files, and validation commands as searchable memory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pnav-record-result-"));
    tempDirs.push(root);
    cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });
    execFileSync("git", ["init"], { cwd: root });
    execFileSync("git", ["config", "user.email", "pnav@example.test"], { cwd: root });
    execFileSync("git", ["config", "user.name", "PNAV Test"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
    writeFileSync(
      path.join(root, "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart"),
      "const rawWidth = 390;\n"
    );
    scanRepo(root);

    const stored = recordTaskResult(root, {
      title: "Fix DS breakpoint",
      task: "fix design system breakpoint",
      guardOutput: "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart:1 [DS-BREAKPOINT] raw width",
      guardCommand: "bash scripts/quality/run_frontend_design_system_usage_guard.sh --mode ci",
      validations: ["make frontend-design-system-usage-guard"],
      result: "passed"
    });

    expect(stored.guardRules).toContain("DS-BREAKPOINT");
    expect(stored.changedFiles).toContain("frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart");
    const memories = searchProjectMemory(root, "DS-BREAKPOINT breakpoint", 5);
    expect(memories[0]?.topic).toBe("Fix DS breakpoint");
  });
});
