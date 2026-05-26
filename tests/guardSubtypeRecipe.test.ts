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

describe("guard recipe subtypes", () => {
  it("adds token hints and forbidden patterns for breakpoint failures", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pnav-guard-subtype-"));
    tempDirs.push(root);
    cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });

    const match = explainGuardRule(root, {
      rule: "DS-BREAKPOINT",
      command: "python scripts/quality/check_role_visual_system_guard.py",
      output: "frontend/lib/page.dart:9 [DS-BREAKPOINT] raw width breakpoint magic width is not allowed"
    });

    expect(match?.subtype).toBe("breakpoint");
    expect(match?.tokenHints).toContain("DSBreakpoints");
    expect(match?.preferredFixPatterns.length).toBeGreaterThan(0);
    expect(match?.forbiddenPatterns.length).toBeGreaterThan(0);
  });
});
