import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProject } from "../src/db/project.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v05-symbols-"));
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

describe("Symbol Model V2", () => {
  it("stores qualified names, body ranges, and code blocks", () => {
    const repo = copyDiscoveryRepo();
    const project = openProject(repo);
    try {
      const symbol = project.db
        .prepare(
          `SELECT s.qualified_name AS qualifiedName, s.container_name AS containerName,
                  s.body_start_line AS bodyStartLine, s.body_end_line AS bodyEndLine
           FROM symbols s JOIN files f ON f.id = s.file_id
           WHERE f.repo_id = ? AND s.name = 'buildTrendCard'
           LIMIT 1`
        )
        .get(project.repo.id) as
        | { qualifiedName: string; containerName: string | null; bodyStartLine: number; bodyEndLine: number }
        | undefined;
      const blockCount = project.db
        .prepare("SELECT COUNT(*) AS count FROM code_blocks WHERE repo_id = ?")
        .get(project.repo.id) as { count: number };

      expect(symbol?.qualifiedName).toBe("AthleteDashboardHomeWidgets.buildTrendCard");
      expect(symbol?.containerName).toBe("AthleteDashboardHomeWidgets");
      expect(symbol?.bodyEndLine).toBeGreaterThan(symbol?.bodyStartLine ?? 0);
      expect(blockCount.count).toBeGreaterThan(0);
    } finally {
      project.db.close();
    }
  });
});
