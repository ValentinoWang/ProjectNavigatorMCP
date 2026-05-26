import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProject } from "../src/db/project.js";
import { loadSourceDoc } from "../src/docs/sourceDocQuery.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-source-doc-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/plan-guard-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("source document scanner", () => {
  it("indexes frontmatter sync targets and execution steps", () => {
    const repo = copyFixtureRepo();
    const result = scanRepo(repo);
    expect(result.documents).toBe(1);

    const sourceDoc = loadSourceDoc(repo, "docs/plans/role_visual_system.md").doc;
    expect(sourceDoc?.ownerDomain).toBe("design_system");
    expect(sourceDoc?.authority).toBe("canonical");
    expect(sourceDoc?.syncTargets).toContain("scripts/quality/check_role_visual_system_guard.py");
    expect(sourceDoc?.syncTargets).toContain("frontend/lib/modules/design_system/theme/experience_theme.dart");
    expect(
      sourceDoc?.steps.some(
        (step) => step.phase === "Phase 0" && step.command?.includes("check_role_visual_system_guard.py")
      )
    ).toBe(true);

    const project = openProject(repo);
    try {
      const target = project.db
        .prepare("SELECT target_file_id AS targetFileId FROM document_targets WHERE target_path = ?")
        .get("frontend/lib/modules/design_system/theme/experience_theme.dart") as { targetFileId: number | null };
      expect(target.targetFileId).toBeTypeOf("number");
    } finally {
      project.db.close();
    }
  });
});
