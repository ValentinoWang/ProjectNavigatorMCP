import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { discoverCode } from "../src/discovery/discoverCode.js";
import { findEntrypoints } from "../src/discovery/entrypoints.js";
import { whyRelated } from "../src/discovery/whyRelated.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v05-discovery-"));
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

describe("Discovery Mode", () => {
  it("finds dashboard entrypoints, read order, and why-related evidence", () => {
    const repo = copyDiscoveryRepo();
    const result = discoverCode(repo, "新增 athlete dashboard training trend card", 10);

    expect(result.mode).toBe("discovery");
    expect(result.entrypoints[0]?.path).toContain("athlete_dashboard_page.dart");
    expect(result.entrypoints[0]?.scoreBreakdown?.moduleProximity).toBeGreaterThan(0);
    expect(result.recommendedReadOrder.some((file) => file.path.includes("athlete_dashboard_home_widgets.dart"))).toBe(
      true
    );
    expect(result.mustRead.some((file) => file.path.includes("athlete_dashboard"))).toBe(true);
    expect([...result.mustRead, ...result.shouldInspect].every((file) => !file.path.startsWith("backend/"))).toBe(true);
    expect(result.reuseBeforeCreate.length).toBeGreaterThan(0);
    expect(result.whyRelated[0]?.evidence.length).toBeGreaterThanOrEqual(1);
  });

  it("uses discovery mode automatically for ordinary feature requests", () => {
    const repo = copyDiscoveryRepo();
    const context = prepareTaskContext(repo, "新增 athlete dashboard training trend card");

    expect(context.mode).toBe("discovery");
    expect(context.discovery?.entrypoints.length).toBeGreaterThan(0);
  });

  it("finds FastAPI route entrypoints", () => {
    const repo = copyDiscoveryRepo();
    const result = findEntrypoints(repo, "修改 session plan API 字段", 5);

    expect(
      result.entrypoints.some((entry) => entry.type === "fastapi_route" && entry.path.includes("session_plans.py"))
    ).toBe(true);
  });

  it("explains why a target file is related", () => {
    const repo = copyDiscoveryRepo();
    const result = whyRelated(
      repo,
      "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_widgets.dart",
      "dashboard trend card"
    );

    expect(result.score).toBeGreaterThan(0);
    expect(result.evidence.some((item) => item.type === "path_token" || item.type === "symbol_token")).toBe(true);
  });
});
