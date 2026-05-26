import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { explainGuardRule } from "../src/guard/ruleRegistry.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("guard rule registry", () => {
  it("explains DS-BREAKPOINT with canonical paths and recipe", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pnav-guard-rule-"));
    tempDirs.push(root);
    cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });

    const match = explainGuardRule(root, {
      rule: "DS-BREAKPOINT",
      command: "bash scripts/quality/run_frontend_design_system_usage_guard.sh --mode ci",
      output: "frontend/lib/page.dart:9 [DS-BREAKPOINT] raw width is not allowed"
    });

    expect(match?.ruleId).toBe("DS-BREAKPOINT");
    expect(match?.domain).toBe("frontend_design_system");
    expect(match?.canonicalPaths).toContain("frontend/lib/modules/design_system/theme/experience_theme.dart");
    expect(match?.recipe.validationCommands.length).toBeGreaterThan(0);
  });
});
