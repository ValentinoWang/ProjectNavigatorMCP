import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v06-incremental-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/v05-discovery-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("incremental scan", () => {
  it("reports changed and skipped files by hash", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    appendFileSync(
      path.join(repo, "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_widgets.dart"),
      "\n// changed\n"
    );
    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.mode).toBe("incremental");
    expect(result.incremental?.filesChanged).toBeGreaterThan(0);
    expect(result.incremental?.filesSkipped).toBeGreaterThan(0);
  });
});
