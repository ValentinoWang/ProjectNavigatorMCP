import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProject } from "../src/db/project.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v06-imports-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/v05-discovery-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Import Resolution V2", () => {
  it("stores resolved import bindings with confidence and evidence", () => {
    const repo = copyDiscoveryRepo();
    const project = openProject(repo);
    try {
      const row = project.db
        .prepare(
          `SELECT b.confidence, b.evidence_json AS evidenceJson, rf.path AS resolvedPath
           FROM import_bindings b
           JOIN files f ON f.id = b.file_id
           JOIN files rf ON rf.id = b.resolved_file_id
           WHERE f.path = 'frontend/lib/modules/user_core/dashboard/athlete_dashboard_page.dart'
           LIMIT 1`
        )
        .get() as { confidence: number; evidenceJson: string; resolvedPath: string } | undefined;

      expect(row?.resolvedPath).toBe("frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_widgets.dart");
      expect(row?.confidence).toBeGreaterThan(0.7);
      expect(row?.evidenceJson).toContain("import_resolved");
    } finally {
      project.db.close();
    }
  });
});
