import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProject } from "../src/db/project.js";
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
  it("uses file-level graph update for small source changes", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    appendFileSync(
      path.join(repo, "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_widgets.dart"),
      "\nclass PartialIncrementalWidget {}\n"
    );
    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.mode).toBe("incremental");
    expect(result.incremental?.filesChanged).toBeGreaterThan(0);
    expect(result.incremental?.filesSkipped).toBeGreaterThan(0);
    expect(result.incremental?.changeKind).toBe("code_graph");
    expect(result.incremental?.partialGraphUpdate).toBe(true);
    expect(result.incremental?.partialGraphVersion).toBe(2);
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
    const project = openProject(repo);
    try {
      const row = project.db
        .prepare("SELECT COUNT(*) AS count FROM symbols WHERE name = 'PartialIncrementalWidget'")
        .get() as { count: number };
      expect(row.count).toBe(1);
    } finally {
      project.db.close();
    }
  });

  it("does not rebuild the graph for workflow profile changes", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(path.join(repo, ".agents", "pnav", "workflow-profiles.json"), JSON.stringify({ profiles: [] }));

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("workflow_profiles_only");
    expect(result.incremental?.changePlanes.workflowProfiles).toContain(".agents/pnav/workflow-profiles.json");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
  });

  it("does not rebuild the graph for eval suite changes", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(path.join(repo, ".agents", "pnav", "discovery-suite.json"), JSON.stringify({ cases: [] }));

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("eval_only");
    expect(result.incremental?.changePlanes.evalSuites).toContain(".agents/pnav/discovery-suite.json");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
  });

  it("limits Makefile changes to command rescans", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    appendFileSync(path.join(repo, "Makefile"), "\nnew-profile-guard:\n\techo ok\n");

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("commands_only");
    expect(result.incremental?.changePlanes.commandSources).toContain("Makefile");
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

  it("reports mixed metadata planes without rebuilding the graph", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(path.join(repo, ".agents", "pnav", "workflow-profiles.json"), JSON.stringify({ profiles: [] }));
    appendFileSync(path.join(repo, "Makefile"), "\nmetadata-guard:\n\techo ok\n");
    appendFileSync(path.join(repo, "AGENTS.md"), "\nMetadata-only rule.\n");

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("mixed");
    expect(result.incremental?.changePlanes.workflowProfiles).toContain(".agents/pnav/workflow-profiles.json");
    expect(result.incremental?.changePlanes.commandSources).toContain("Makefile");
    expect(result.incremental?.changePlanes.docs).toContain("AGENTS.md");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
  });

  it("marks code graph stale for mixed dirty metadata-only scans", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    mkdirSync(path.join(repo, ".agents", "pnav"), { recursive: true });
    writeFileSync(path.join(repo, ".agents", "pnav", "workflow-profiles.json"), JSON.stringify({ profiles: [] }));
    appendFileSync(
      path.join(repo, "frontend/lib/modules/user_core/dashboard/athlete_dashboard_home_widgets.dart"),
      "\nclass MetadataOnlyStaleWidget {}\n"
    );

    const result = scanRepo(repo, { mode: "incremental", metadataOnly: true });

    expect(result.incremental?.changeKind).toBe("mixed");
    expect(result.incremental?.codeGraphStale).toBe(true);
    expect(result.incremental?.codeGraphStaleReason).toContain("--metadata-only");
    expect(result.incremental?.partialGraphUpdate).toBe(false);
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
  });

  it("uses batch partial graph update for medium source changes", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    mkdirSync(path.join(repo, "src", "generated"), { recursive: true });
    for (let index = 0; index < 21; index += 1) {
      writeFileSync(
        path.join(repo, "src", "generated", `file_${index}.ts`),
        `export const value${index} = ${index};\n`
      );
    }

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("code_graph");
    expect(result.incremental?.partialGraphUpdate).toBe(true);
    expect(result.incremental?.actions).toContain("batch_partial_graph_update");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
  });

  it("falls back to conservative rebuild when source changes exceed the batch threshold", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    mkdirSync(path.join(repo, "src", "generated"), { recursive: true });
    for (let index = 0; index < 101; index += 1) {
      writeFileSync(
        path.join(repo, "src", "generated", `file_${index}.ts`),
        `export const value${index} = ${index};\n`
      );
    }

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.partialGraphUpdate).toBe(false);
    expect(result.incremental?.conservativeFullRebuild).toBe(true);
    expect(result.incremental?.fallbackReason).toContain("100");
  });

  it("invalidates deleted source files without a conservative rebuild", () => {
    const repo = copyDiscoveryRepo();
    scanRepo(repo);
    rmSync(path.join(repo, "web", "src", "DashboardTrendCard.tsx"));

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.changeKind).toBe("code_graph");
    expect(result.incremental?.deletedCodeFiles).toBe(1);
    expect(result.incremental?.partialGraphUpdate).toBe(true);
    expect(result.incremental?.actions).toContain("invalidate_deleted_source");
    expect(result.incremental?.conservativeFullRebuild).toBe(false);
    const project = openProject(repo);
    try {
      const deleted = project.db
        .prepare("SELECT deleted_at FROM files WHERE path = 'web/src/DashboardTrendCard.tsx'")
        .get() as { deleted_at: string | null };
      expect(deleted.deleted_at).not.toBeNull();
      const outgoingSymbols = project.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM symbols s JOIN files f ON f.id = s.file_id
           WHERE f.path = 'web/src/DashboardTrendCard.tsx'`
        )
        .get() as { count: number };
      expect(outgoingSymbols.count).toBe(0);
    } finally {
      project.db.close();
    }
  });

  it("expands affected callers and drops stale exact incoming edges after a callee rename", () => {
    const repo = copyDiscoveryRepo();
    writeFileSync(
      path.join(repo, "web", "src", "DashboardPage.tsx"),
      "import { DashboardTrendCard } from './DashboardTrendCard';\nexport function DashboardPage() { return DashboardTrendCard({ title: 'load', value: 1 }); }\n"
    );
    scanRepo(repo);
    writeFileSync(
      path.join(repo, "web", "src", "DashboardTrendCard.tsx"),
      "export function RenamedTrendCard() { return null; }\n"
    );

    const result = scanRepo(repo, { mode: "incremental" });

    expect(result.incremental?.partialGraphUpdate).toBe(true);
    expect(result.incremental?.affectedCallerExpansion.enabled).toBe(true);
    expect(result.incremental?.affectedCallerExpansion.candidateCallers).toBeGreaterThan(0);
    const project = openProject(repo);
    try {
      const stale = project.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM symbol_edges se
           JOIN symbols target ON target.id = se.to_symbol_id
           JOIN files target_file ON target_file.id = target.file_id
           WHERE target_file.path = 'web/src/DashboardTrendCard.tsx'
             AND target.name = 'DashboardTrendCard'`
        )
        .get() as { count: number };
      expect(stale.count).toBe(0);
    } finally {
      project.db.close();
    }
  });
});
