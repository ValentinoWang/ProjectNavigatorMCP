import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findFlutterRouteToWidgetChain } from "../src/ui/flutterRouteChain.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyNoiseRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v082-route-coverage-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/v08-production-noise-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("route-to-widget test coverage", () => {
  it("reports route_test_covered when a chain step has a related test", () => {
    const repo = copyNoiseRepo();
    scanRepo(repo);

    const result = findFlutterRouteToWidgetChain(repo, "新增 athlete dashboard training trend card");

    expect(result.completeness).toBe("route_test_covered");
    expect(result.depth).toBeGreaterThanOrEqual(3);
    expect(result.testCoverage?.covered).toBe(true);
    expect(
      result.testCoverage?.testFiles.some((file) => file.includes("athlete_dashboard_home_sections_test.dart"))
    ).toBe(true);
  });

  it("falls back to implementation depth when no chain tests exist", () => {
    const repo = copyNoiseRepo();
    rmSync(path.join(repo, "frontend/test"), { recursive: true, force: true });
    scanRepo(repo);

    const result = findFlutterRouteToWidgetChain(repo, "新增 athlete dashboard training trend card");

    expect(["route_main_widget", "route_section_card"]).toContain(result.completeness);
    expect(result.testCoverage?.covered).toBe(false);
  });
});
