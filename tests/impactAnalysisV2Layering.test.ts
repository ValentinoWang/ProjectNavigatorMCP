import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { impactAnalysisV2 } from "../src/graph/impactAnalysisV2.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v06-impact-"));
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

describe("impactAnalysisV2 layering", () => {
  it("returns direct, entrypoint, test, reuse, and risk layers", () => {
    const repo = copyDiscoveryRepo();
    const result = impactAnalysisV2(repo, "AthleteDashboardHomeWidgets.buildTrendCard");

    expect(result.directCallees.length).toBeGreaterThan(0);
    expect(result.entrypointImpact).toBeDefined();
    expect(result.testImpact.testFiles.length).toBeGreaterThan(0);
    expect(result.reuseImpact).toBeDefined();
    expect(result.riskSummary.length).toBeGreaterThan(0);
  });
});
