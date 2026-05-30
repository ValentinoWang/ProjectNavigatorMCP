import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function copyProductionNoiseRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v08-production-"));
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

  it("promotes authoritative route-to-widget handoff into capsule core read order", () => {
    const repo = copyProductionNoiseRepo();
    const context = prepareTaskContext(repo, "url-athlete-dashboard training trend card compact layout", {
      includeMemory: false,
      includeDirtyStatus: false
    });
    const corePaths = context.coreReadOrder.slice(0, 5).map((item) => item.path);

    expect(corePaths).toContain("frontend/lib/core/router/app_router.dart");
    expect(corePaths).toContain("frontend/lib/modules/user_core/dashboard/athlete_dashboard_page.dart");
    expect(corePaths).toContain("frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_view.dart");
    expect(corePaths).toContain("frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_sections.dart");
    expect(corePaths).not.toContain("backend/app/services/trend_service.py");
  });

  it("demotes generic related commands when workflow commands are available", () => {
    const repo = copyDiscoveryRepo();
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(
      path.join(repo, ".agents", "pnav", "workflow-profiles.json"),
      JSON.stringify({
        profiles: [
          {
            name: "dashboard_workflow_commands",
            match: { any: ["dashboard"] },
            mustRead: ["frontend/lib/core/router/app_router.dart"],
            recommendedCommands: [{ command: "make dashboard-workflow-guard", required: true }]
          }
        ]
      })
    );

    const result = discoverCode(repo, "新增 dashboard trend card", 10);
    const context = prepareTaskContext(repo, "新增 dashboard trend card");

    expect(result.authoritativeHandoff.workflowProtocol.recommendedCommands[0]?.command).toBe(
      "make dashboard-workflow-guard"
    );
    expect(result.relatedTests.commands).toEqual([]);
    expect(result.relatedTests.fallbackCommands.length).toBeGreaterThan(0);
    expect(context.recommendedCommands[0]?.command).toBe("make dashboard-workflow-guard");
    expect(context.relatedTests.commands).toEqual([]);
    expect(context.relatedTests.fallbackCommands.length).toBeGreaterThan(0);
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
