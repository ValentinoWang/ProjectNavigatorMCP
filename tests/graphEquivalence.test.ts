import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { benchmarkFreshGraph } from "../src/benchmark/freshGraphBenchmark.js";
import { runEquivalenceSuite } from "../src/eval/equivalenceRunner.js";
import { graphSnapshot } from "../src/graph/graphSnapshot.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyAdversarialRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v09-equivalence-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/v09-graph-adversarial-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("fresh graph equivalence", () => {
  it("exports stable graph snapshots without row-id ordering noise", () => {
    const repo = copyAdversarialRepo();
    scanRepo(repo, { mode: "full" });

    const first = graphSnapshot(repo);
    const second = graphSnapshot(repo);

    expect(first.counts).toEqual(second.counts);
    expect(first.files.map((item) => item.path)).toEqual(second.files.map((item) => item.path));
    expect(first.symbolEdges.map((item) => item.key)).toEqual(second.symbolEdges.map((item) => item.key));
  });

  it("proves partial-vs-full equivalence for adversarial rename, delete, and route mutations", () => {
    const repo = copyAdversarialRepo();
    const suitePath = path.join(repo, ".agents", "pnav", "v09-mutations.json");

    const result = runEquivalenceSuite(repo, suitePath);

    expect(result.passed).toBe(true);
    expect(result.results.map((item) => item.mutationId)).toEqual([
      "rename_exported_symbol",
      "delete_source_file",
      "route_widget_mutation"
    ]);
    expect(result.results.flatMap((item) => item.hardFailures)).toEqual([]);
  }, 20_000);

  it("compares partial scan output against a temporary full scan when requested", () => {
    const repo = copyAdversarialRepo();
    scanRepo(repo, { mode: "full" });
    writeFileSync(path.join(repo, "src", "A.ts"), "export function FooV2() {\n  return 2;\n}\n");
    writeFileSync(
      path.join(repo, "src", "B.ts"),
      'import { FooV2 } from "./A";\n\nexport function callFoo() {\n  return FooV2();\n}\n'
    );

    const result = scanRepo(repo, { mode: "incremental", verifyPartial: true, compareFull: true });

    expect(result.incremental?.partialGraphUpdate).toBe(true);
    expect(result.incremental?.partialVerification?.enabled).toBe(true);
    expect(result.incremental?.partialVerification?.passed).toBe(true);
  }, 20_000);

  it("emits fresh graph benchmark fields without mixing metadata-only and fresh eval scope", () => {
    const repo = copyAdversarialRepo();
    const suitePath = path.join(repo, ".agents", "pnav", "benchmark-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [
          {
            id: "dashboard",
            task: "dashboard route widget mutation",
            expected: {
              mustReadAny: ["frontend/lib/app_router.dart", "frontend/lib/dashboard_page.dart"],
              maxMustRead: 5
            }
          }
        ]
      })
    );

    const result = benchmarkFreshGraph(repo, suitePath);

    expect(result.fullScanMs).toBeGreaterThanOrEqual(0);
    expect(result.noChangeIncrementalMs).toBeGreaterThanOrEqual(0);
    expect(result.metadataOnlyMs).toBeGreaterThanOrEqual(0);
    expect(result.smallPartialMs).toBeGreaterThanOrEqual(0);
    expect(result.batchPartialMs).toBeGreaterThanOrEqual(0);
    expect(result.freshEvalMs).toBeGreaterThanOrEqual(0);
    expect(result.metadataEvalMs).toBeGreaterThanOrEqual(0);
    expect(result.cacheStats.fileCatalog).toBeDefined();
    expect(result.slowestStages).toBeDefined();
  }, 20_000);
});
