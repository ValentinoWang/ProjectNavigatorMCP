import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDiscoveryEval } from "../src/eval/evalRunner.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v08-eval-"));
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

describe("production discovery eval", () => {
  it("scores strict discovery suites and stores an eval run", () => {
    const repo = copyDiscoveryRepo();
    const suitePath = path.join(repo, ".pnav", "discovery-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [
          {
            id: "flutter-dashboard-training-trend",
            task: "新增 athlete dashboard training trend card",
            expected: {
              mustReadAny: [
                "frontend/lib/core/router/app_router.dart",
                "frontend/lib/modules/user_core/dashboard/athlete_dashboard_page.dart"
              ],
              mustNotRead: ["backend/**", "database/**"],
              chainContains: ["route", "page"],
              reuseCandidatesAny: ["TrainingTrendCard"],
              testsAny: ["dashboard"]
            }
          }
        ]
      })
    );

    const result = runDiscoveryEval(repo, suitePath, true);
    expect(result.productionScore).toBeGreaterThanOrEqual(0.9);
    expect(result.passed).toBe(true);
  });
});
