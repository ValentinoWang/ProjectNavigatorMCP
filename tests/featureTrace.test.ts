import { cpSync, mkdtempSync, rmSync } from "node:fs";
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
});
