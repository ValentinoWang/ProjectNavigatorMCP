import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { moduleMap } from "../src/discovery/moduleMap.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v05-modules-"));
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

describe("module map", () => {
  it("builds path modules with core files and tests", () => {
    const repo = copyDiscoveryRepo();
    const result = moduleMap(repo, "user_core/dashboard", 5);

    expect(result.modules[0]?.root).toContain("frontend/lib/modules/user_core/dashboard");
    expect(result.modules[0]?.coreFiles.some((file) => file.includes("athlete_dashboard"))).toBe(true);
    expect(result.modules[0]?.tests.some((file) => file.includes("athlete_dashboard_page_test.dart"))).toBe(true);
  });
});
