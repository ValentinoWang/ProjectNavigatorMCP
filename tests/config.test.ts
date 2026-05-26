import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "../src/cli/commands/init.js";
import { findRelatedFiles } from "../src/graph/relatedFiles.js";
import { openProject } from "../src/db/project.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-config-"));
  tempDirs.push(root);
  mkdirSync(path.join(root, "src/billing"), { recursive: true });
  mkdirSync(path.join(root, "generated"), { recursive: true });
  writeFileSync(path.join(root, "src/billing/invoice.ts"), "export function createInvoice() { return 1; }\n");
  writeFileSync(path.join(root, "generated/client.generated.ts"), "export function generatedClient() { return 1; }\n");
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("project config", () => {
  it("uses project-local include, exclude, and domain boosts", () => {
    const repo = makeRepo();
    initProject(repo);
    writeFileSync(
      path.join(repo, ".pnav/config.json"),
      JSON.stringify(
        {
          include: ["src/**", "generated/**"],
          exclude: ["generated/**"],
          domains: [
            {
              name: "billing",
              keywords: ["invoice", "billing", "发票"],
              paths: ["src/billing/**"],
              commands: []
            }
          ],
          source_path_boosts: [{ pattern: "src/billing/**", boost: 0.4 }]
        },
        null,
        2
      )
    );

    scanRepo(repo);
    const project = openProject(repo);
    try {
      const paths = project.db
        .prepare("SELECT path FROM files WHERE repo_id = ? ORDER BY path")
        .all(project.repo.id)
        .map((row) => (row as { path: string }).path);
      expect(paths).toContain("src/billing/invoice.ts");
      expect(paths).not.toContain("generated/client.generated.ts");
    } finally {
      project.db.close();
    }

    const related = findRelatedFiles(repo, "invoice billing change", 3);
    expect(related.files[0]?.path).toBe("src/billing/invoice.ts");
  });
});
