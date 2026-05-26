import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { scanRepo } from "../src/scanner/scanRepo.js";
import { auditTaskResult } from "../src/tasks/taskAudit.js";

const tempDirs: string[] = [];

function copyGitFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-finish-audit-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "pnav@example.test"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Project Navigator"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root, stdio: "ignore" });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("finish-time audit", () => {
  it("flags out-of-boundary backend edits and missing validation", () => {
    const repo = copyGitFixtureRepo();
    const context = prepareTaskContext(repo, "role visual design system governance", {
      sourceDoc: "docs/plans/role_visual_system.md",
      guardOutput:
        "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart:9 [DS-BREAKPOINT] raw width is not allowed",
      guardCommand: "python scripts/quality/check_role_visual_system_guard.py",
      domainHint: "frontend_design_system"
    });

    appendFileSync(path.join(repo, "backend/app/design_system_noise.py"), "\n# unrelated backend edit\n");
    const result = auditTaskResult(repo, {
      taskSessionId: context.taskSessionId,
      validationResults: [{ command: "python scripts/quality/check_role_visual_system_guard.py", result: "passed" }]
    });

    expect(result.audit.result).not.toBe("pass");
    expect(result.audit.violations.some((violation) => violation.path === "backend/app/design_system_noise.py")).toBe(
      true
    );
    expect(result.audit.missingValidations.length).toBeGreaterThan(0);
  });
});
