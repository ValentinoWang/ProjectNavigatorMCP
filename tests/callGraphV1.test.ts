import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findCallers, findCallees } from "../src/discovery/symbolGraph.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v05-callgraph-"));
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

describe("Call Graph V1", () => {
  it("finds callees and callers with confidence evidence", () => {
    const repo = copyDiscoveryRepo();
    const callees = findCallees(repo, "AthleteDashboardHomeWidgets.buildTrendCard", 10);
    const callers = findCallers(repo, "TrainingTrendCard", 10);

    expect(callees.callees.some((hit) => hit.symbol === "TrainingTrendCard")).toBe(true);
    expect(callers.callers.some((hit) => hit.qualifiedName === "AthleteDashboardHomeWidgets.buildTrendCard")).toBe(
      true
    );
    expect(callees.callees[0]?.confidence).toBeGreaterThan(0);
  });
});
