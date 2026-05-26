import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { duplicateClusters } from "../src/discovery/duplicateClusters.js";
import { explainReuse } from "../src/discovery/explainReuse.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v06-duplicates-"));
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

describe("duplicate clusters", () => {
  it("persists duplicate clusters and explains reuse", () => {
    const repo = copyDiscoveryRepo();
    const clusters = duplicateClusters(repo, "", 10);
    const explanation = explainReuse(repo, "dashboard training trend card", 5);

    expect(clusters.clusters.length).toBeGreaterThan(0);
    expect(clusters.clusters.some((cluster) => cluster.members.length > 1)).toBe(true);
    expect(explanation.recommendation).toContain("Inspect");
  });
});
