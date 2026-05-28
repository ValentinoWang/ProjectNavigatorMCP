import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyDiscoveryRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-v06-incremental-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/v05-discovery-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("incremental scan", () => {
  it("reports changed and skipped files by hash", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    appendFileSync(
      path.join(repo, "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_widgets.dart"),
      "\n// changed\n"
    );
    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.mode).toBe("incremental");
    expect(result.incremental?.filesChanged).toBeGreaterThan(0);
    expect(result.incremental?.filesSkipped).toBeGreaterThan(0);
    expect(result.incremental?.changeKind).toBe("code_graph");
    expect(result.incremental?.conservativeFullRebuild).toBe(true);
  });

  it("does not rebuild the graph for workflow profile changes", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(path.join(repo, ".agents", "pnav", "workflow-profiles.json"), JSON.stringify({ profiles: [] }));

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("workflow_profiles_only");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
  });

  it("does not rebuild the graph for eval suite changes", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(path.join(repo, ".agents", "pnav", "discovery-suite.json"), JSON.stringify({ cases: [] }));

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("eval_only");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
  });

  it("limits Makefile changes to command rescans", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    appendFileSync(path.join(repo, "Makefile"), "\nnew-profile-guard:\n\techo ok\n");

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("commands_only");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
    expect(result.commands).toBeGreaterThan(0);
  });

  it("limits docs and AGENTS changes to rule/document rescans", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    appendFileSync(path.join(repo, "AGENTS.md"), "\nAdditional local rule.\n");

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("docs_only");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
  });
});
