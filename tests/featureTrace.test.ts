import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { traceFeature } from "../src/discovery/featureTracer.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v06-chain-"));
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

describe("traceFeature", () => {
  it("builds a feature chain with entrypoint, implementation, reuse, and test steps", () => {
    const repo = copyDiscoveryRepo();
    const result = traceFeature(repo, "新增 athlete dashboard training trend card", 5);
    const first = result.chains[0];

    expect(first?.chainType).toBe("verified_chain");
    expect(first?.path.some((step) => step.type.includes("flutter") || step.type === "symbol_entry")).toBe(true);
    expect(result.chains.some((chain) => chain.path.some((step) => step.type === "reuse_candidate"))).toBe(true);
    expect(result.chains.some((chain) => chain.path.some((step) => step.type === "test"))).toBe(true);
    expect(first?.confidence).toBeGreaterThan(0);
  });

  it("uses workflow mode when repo-local workflow profiles match", () => {
    const repo = copyDiscoveryRepo();
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(
      path.join(repo, ".agents", "pnav", "workflow-profiles.json"),
      JSON.stringify({
        profiles: [
          {
            name: "contract_first_trace",
            match: { any: ["openapi", "contract"] },
            mustRead: ["backend/app/api/session_plans.py"],
            recommendedCommands: [{ command: "make openapi-sync-guard", required: true }]
          }
        ]
      })
    );

    const result = traceFeature(repo, "给 OpenAPI contract 增加 trendSlope 字段", 5);

    expect(result.mode).toBe("workflow");
    expect(result.routeToWidgetChainApplicability).toBe("not_applicable");
    expect(result.workflowProtocol.recommendedCommands.some((item) => item.command === "make openapi-sync-guard")).toBe(
      true
    );
    expect(result.workflowChain.some((step) => step.target === "backend/app/api/session_plans.py")).toBe(true);
    expect(result.routeToWidgetChain.steps).toEqual([]);
  });
});
