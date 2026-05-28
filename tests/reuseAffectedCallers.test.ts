import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverCode } from "../src/discovery/discoverCode.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyNoiseRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v082-reuse-callers-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/v08-production-noise-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("reuse affected callers", () => {
  it("returns caller paths for the selected reuse decision", () => {
    const repo = copyNoiseRepo();
    const result = discoverCode(repo, "新增 athlete dashboard training trend card", 25);
    const decision = result.authoritativeHandoff.reuseDecision;

    expect(decision.path).toBeTruthy();
    expect(decision.affectedCallers.length).toBeGreaterThan(0);
    expect(decision.affectedCallers.some((file) => file.includes("dashboard"))).toBe(true);
    expect(decision.recommendedAction.toLowerCase()).toContain("caller");
  });
});
