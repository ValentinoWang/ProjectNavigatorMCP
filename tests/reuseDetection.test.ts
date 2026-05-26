import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findReusableComponents, findSimilarCode } from "../src/discovery/reuse.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v05-reuse-"));
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

describe("Reuse detection", () => {
  it("finds similar card implementations and reusable components", () => {
    const repo = copyDiscoveryRepo();
    const similar = findSimilarCode(repo, "AthleteDashboardHomeWidgets.duplicatedSummaryCard", 5);
    const reuse = findReusableComponents(repo, "dashboard training trend card", 5);

    expect(similar.matches.some((hit) => hit.qualifiedName === "TrainingTrendCard.buildCard")).toBe(true);
    expect(reuse.reuseCandidates.some((hit) => hit.path.includes("training_trend_card.dart"))).toBe(true);
  });
});
