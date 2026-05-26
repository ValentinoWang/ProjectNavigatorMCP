import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeGuardOutput } from "../src/guard/analyzeGuardOutput.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-guard-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("analyzeGuardOutput", () => {
  it("puts guard file:line before source_doc targets", () => {
    const repo = copyFixtureRepo();
    scanRepo(repo);
    const result = analyzeGuardOutput(
      repo,
      [
        "ERROR role_visual_system",
        "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart:9",
        "Private role palette usage is not allowed."
      ].join("\n"),
      {
        command: "python scripts/quality/check_role_visual_system_guard.py",
        sourceDoc: "docs/plans/role_visual_system.md"
      }
    );

    expect(result.findings[0]).toMatchObject({
      file: "frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart",
      line: 9
    });
    expect(result.likelyFixFiles[0]?.path).toBe("frontend/lib/modules/dashboard/athlete_dashboard_home_widgets.dart");
    expect(result.likelyFixFiles.map((file) => file.path)).toContain(
      "frontend/lib/modules/design_system/theme/experience_theme.dart"
    );
    expect(result.validationCommands).toContain("python scripts/quality/check_role_visual_system_guard.py");
  });
});
