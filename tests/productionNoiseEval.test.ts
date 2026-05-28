import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    writeFileSync(suitePath, JSON.stringify({ cases: [strictEvalCase()] }));

    const result = runDiscoveryEval(repo, suitePath, true);

    expect(result.productionScore).toBeGreaterThanOrEqual(0.9);
    expect(result.cases[0]?.metrics.suppressionReasonQuality).toBe(1);
    expect(result.cases[0]?.hardFailures).toEqual([]);
    expect(result.passed).toBe(true);
  }, 15_000);

  it("fails strict eval on hard suppression reason mismatches even when score remains high", () => {
    const repo = copyNoiseRepo();
    const suitePath = path.join(repo, ".pnav", "production-noise-hard-fail-suite.json");
    const brokenCase = strictEvalCase();
    brokenCase.expected.suppressedWithReasons = [
      { path: "frontend/lib/l10n/l10n.dart", reason: "logger_utility" },
      { path: "frontend/lib/core/logging/logger.dart", reason: "logger_utility" },
      { path: "frontend/lib/core/errors/api_error.dart", reason: "api_error_wrapper" }
    ];
    writeFileSync(suitePath, JSON.stringify({ cases: [brokenCase] }));

    const result = runDiscoveryEval(repo, suitePath, true);

    expect(result.cases[0]?.metrics.productionScore).toBeGreaterThanOrEqual(0.9);
    expect(result.cases[0]?.metrics.suppressionReasonQuality).toBeLessThan(1);
    expect(result.cases[0]?.hardFailures).toContain("suppression_reason_mismatch");
    expect(result.cases[0]?.passed).toBe(false);
    expect(result.passed).toBe(false);
  }, 15_000);

  it("fails strict eval when expected workflow commands are missing", () => {
    const repo = copyNoiseRepo();
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(
      path.join(repo, ".agents", "pnav", "workflow-profiles.json"),
      JSON.stringify({
        profiles: [
          {
            name: "dashboard_profile_command",
            match: { any: ["dashboard"] },
            mustRead: ["frontend/lib/core/router/app_router.dart"],
            recommendedCommands: [{ command: "make dashboard-profile-guard", required: true }]
          }
        ]
      })
    );
    const suitePath = path.join(repo, ".pnav", "workflow-command-hard-fail-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [
          {
            id: "workflow-command-missing",
            task: "新增 athlete dashboard training trend card",
            expected: {
              mustReadAny: ["frontend/lib/core/router/app_router.dart"],
              recommendedCommandContains: ["make missing-profile-guard"],
              maxMustRead: 5
            }
          }
        ]
      })
    );

    const result = runDiscoveryEval(repo, suitePath, true);

    expect(result.cases[0]?.hardFailures).toContain("recommended_command_missing");
    expect(result.cases[0]?.latencyBreakdown.workflowProfilesMs).toBeGreaterThanOrEqual(0);
    expect(result.slowestStages.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  }, 15_000);

  it("reports metadata-only eval index status when code graph is stale", () => {
    const repo = copyNoiseRepo();
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(
      path.join(repo, ".agents", "pnav", "workflow-profiles.json"),
      JSON.stringify({
        profiles: [
          {
            name: "dashboard_metadata_only",
            match: { any: ["dashboard"] },
            mustRead: ["frontend/lib/core/router/app_router.dart"]
          }
        ]
      })
    );
    appendFileSync(
      path.join(repo, "frontend/lib/modules/user_core/dashboard/athlete_dashboard_page.dart"),
      "\nclass MetadataOnlyEvalStaleWidget {}\n"
    );
    const suitePath = path.join(repo, ".pnav", "metadata-only-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [
          {
            id: "metadata-profile-only",
            task: "dashboard profile metadata validation",
            expected: {
              mustReadAny: ["frontend/lib/core/router/app_router.dart"],
              maxMustRead: 5,
              profileSourcesAny: ["repo_local"]
            }
          }
        ]
      })
    );

    const result = runDiscoveryEval(repo, suitePath, { strict: true, metadataOnly: true });

    expect(result.indexStatus.workflowProfilesFresh).toBe(true);
    expect(result.indexStatus.evalSuitesFresh).toBe(true);
    expect(result.indexStatus.codeGraphStale).toBe(true);
    expect(result.indexStatus.codeGraphStaleReason).toContain("--metadata-only");
    expect(result.indexStatus.scanIncremental?.conservativeFullRebuild).toBe(false);
    expect(result.evalValidity.scoreScope).toBe("metadata_only");
    expect(result.evalValidity.validFor).toContain("workflowProtocol assertions");
    expect(result.evalValidity.notValidFor).toContain("fresh symbol graph");
    expect(result.passed).toBe(true);
  }, 15_000);

  it("fails strict metadata-only eval when a case requires a fresh code graph", () => {
    const repo = copyNoiseRepo();
    appendFileSync(
      path.join(repo, "frontend/lib/modules/user_core/dashboard/athlete_dashboard_page.dart"),
      "\nclass RequiresFreshGraphWidget {}\n"
    );
    const suitePath = path.join(repo, ".pnav", "metadata-only-fresh-required-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [{ ...strictEvalCase(), requiresFreshCodeGraph: true }]
      })
    );

    const result = runDiscoveryEval(repo, suitePath, { strict: true, metadataOnly: true });

    expect(result.evalValidity.scoreScope).toBe("metadata_only");
    expect(result.evalValidity.freshCodeGraphRequired).toBe(true);
    expect(result.cases[0]?.hardFailures).toContain("fresh_code_graph_required_but_stale");
    expect(result.passed).toBe(false);
  }, 15_000);

  it("reports eval runtime cache hits within a suite", () => {
    const repo = copyNoiseRepo();
    const suitePath = path.join(repo, ".pnav", "cache-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [strictEvalCase(), { ...strictEvalCase(), id: "dashboard-noise-suppression-repeat" }]
      })
    );

    const result = runDiscoveryEval(repo, suitePath, true);
    const totalHits = Object.values(result.cacheStats).reduce((total, stats) => total + stats.hits, 0);

    expect(totalHits).toBeGreaterThan(0);
    expect(result.cacheStats.fileCatalog.hits).toBeGreaterThan(0);
    expect(result.cacheStats.workflowProfiles.hits).toBeGreaterThan(0);
    expect(result.cacheStats.entrypointCatalog.hits).toBeGreaterThan(0);
  }, 15_000);
});

function strictEvalCase() {
  return {
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
  };
}
