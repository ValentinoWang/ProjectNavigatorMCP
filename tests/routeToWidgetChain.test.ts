import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverCode } from "../src/discovery/discoverCode.js";
import { traceFeature } from "../src/discovery/featureTracer.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v08-chain-"));
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

describe("Production route-to-widget discovery", () => {
  it("builds an authoritative handoff with a strict mustRead gate", () => {
    const repo = copyDiscoveryRepo();
    const result = discoverCode(repo, "新增 athlete dashboard training trend card", 15);

    expect(result.authoritativeHandoff.mode).toBe("strict_discovery");
    expect(result.authoritativeHandoff.chainDepth).toBeGreaterThanOrEqual(3);
    expect(["route_main_widget", "route_section_card"]).toContain(result.authoritativeHandoff.chainCompleteness);
    expect(result.authoritativeHandoff.reuseDecision.verdict).toMatch(/reuse_as_is|extend_existing|extract_shared/);
    expect(result.authoritativeHandoff.reuseDecision.apiFit).toMatchObject({ requiredParamsCovered: true });
    expect(result.authoritativeHandoff.mustRead.length).toBeLessThanOrEqual(5);
    expect(result.authoritativeHandoff.coreChain.some((item) => item.path.includes("app_router.dart"))).toBe(true);
    expect(result.authoritativeHandoff.mustRead.some((item) => item.path.includes("athlete_dashboard_page.dart"))).toBe(
      true
    );
    expect(
      result.authoritativeHandoff.suppressedCandidates.every((item) => !item.path.includes("api_error.dart"))
    ).toBe(true);
  }, 15_000);

  it("exposes routeToWidgetChain in trace_feature", () => {
    const repo = copyDiscoveryRepo();
    const result = traceFeature(repo, "新增 athlete dashboard training trend card", 5);

    expect(result.routeToWidgetChain.steps.some((step) => step.kind === "route")).toBe(true);
    expect(result.routeToWidgetChain.steps.some((step) => step.kind === "page")).toBe(true);
    expect(result.routeToWidgetChain.depth).toBe(result.routeToWidgetChain.steps.length);
    expect(["route_main_widget", "route_section_card"]).toContain(result.routeToWidgetChain.completeness);
  }, 15_000);
});
