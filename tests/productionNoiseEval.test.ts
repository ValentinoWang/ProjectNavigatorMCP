import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDiscoveryEval } from "../src/eval/evalRunner.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyNoiseRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v082-noise-eval-"));
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

describe("production noise eval", () => {
  it("scores suppression reasons, mustRead budget, and route test coverage", () => {
    const repo = copyNoiseRepo();
    const suitePath = path.join(repo, ".pnav", "production-noise-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [
          {
            id: "dashboard-noise-suppression",
            task: "新增 athlete dashboard training trend card",
            expected: {
              mustReadAny: [
                "frontend/lib/core/router/app_router.dart",
                "frontend/lib/modules/user_core/dashboard/athlete_dashboard_page.dart",
                "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_sections.dart"
              ],
              mustNotRead: [
                "backend/**",
                "frontend/e2e/**",
                "frontend/screenshots/**",
                "frontend/qa/**",
                "frontend/lib/l10n/l10n.dart",
                "frontend/lib/core/logging/logger.dart",
                "frontend/lib/core/errors/api_error.dart"
              ],
              chainContains: ["route", "page", "widget"],
              reuseCandidatesAny: ["TrainingTrendCard"],
              testsAny: ["athlete_dashboard_home_sections_test.dart"],
              maxMustRead: 5,
              minChainCompleteness: "route_test_covered",
              suppressedWithReasons: [
                { path: "frontend/lib/l10n/l10n.dart", reason: "import_only_l10n_wrapper" },
                { path: "frontend/lib/core/logging/logger.dart", reason: "logger_utility" },
                { path: "frontend/lib/core/errors/api_error.dart", reason: "api_error_wrapper" }
              ]
            }
          }
        ]
      })
    );

    const result = runDiscoveryEval(repo, suitePath, true);

    expect(result.productionScore).toBeGreaterThanOrEqual(0.9);
    expect(result.cases[0]?.metrics.suppressionReasonQuality).toBe(1);
    expect(result.passed).toBe(true);
  }, 15_000);
});
