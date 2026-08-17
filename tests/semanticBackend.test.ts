import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepo } from "../src/scanner/scanRepo.js";
import { SemanticBackendRouter } from "../src/semantic/backendRouter.js";
import { CbmSemanticBackend } from "../src/semantic/cbmBackend.js";
import { callCbmTool, readCbmVersion } from "../src/semantic/cbmProcess.js";
import { hashRepoFiles } from "../src/semantic/provenance.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("CBM process contract", () => {
  it("accepts exactly the supported version and rejects version drift", async () => {
    const repo = fixtureRepo();
    const supported = fakeCbm(repo, { version: "0.10.2" });
    const unsupported = fakeCbm(repo, { version: "0.10.3" });

    await expect(readCbmVersion({ binary: supported.binary })).resolves.toBe("0.10.2");
    const backend = new CbmSemanticBackend({ cbmBinary: unsupported.binary });
    await expect(backend.search(repo, "add", 10)).rejects.toMatchObject({
      code: "unsupported_version"
    });
  });

  it.each([
    ["malformed", "invalid_response"],
    ["nonzero", "tool_error"],
    ["timeout", "timeout"]
  ] as const)("reports %s subprocess failures as %s", async (mode, code) => {
    const repo = fixtureRepo();
    const fake = fakeCbm(repo, { queryFailure: mode });

    await expect(
      callCbmTool(
        "search_graph",
        { project: "fixture", query: "add" },
        { binary: fake.binary, timeoutMs: mode === "timeout" ? 40 : 10_000 }
      )
    ).rejects.toMatchObject({ code });
  });
});

describe("semantic backend routing", () => {
  it("falls back for auto queries but fails closed for explicit CBM", async () => {
    const repo = fixtureRepo();
    scanRepo(repo);
    const fake = fakeCbm(repo, { queryFailure: "malformed" });
    const automatic = new SemanticBackendRouter({ preference: "auto", cbmBinary: fake.binary });
    const explicit = new SemanticBackendRouter({ preference: "cbm", cbmBinary: fake.binary });

    const fallback = await automatic.search(repo, "add", 10);
    expect(fallback.selectedBackend).toBe("builtin");
    expect(fallback.requestedBackend).toBe("auto");
    expect(fallback.fallback).toMatchObject({ used: true, from: "codebase-memory" });
    expect(fallback.warnings.join(" ")).toContain("supporting evidence only");

    await expect(explicit.search(repo, "add", 10)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("does not adopt a CBM project whose canonical root differs", async () => {
    const repo = fixtureRepo();
    const otherRoot = fixtureRepo();
    const fake = fakeCbm(repo, { advertisedRoot: otherRoot });
    const backend = new CbmSemanticBackend({ cbmBinary: fake.binary });

    const status = await backend.status(repo);
    expect(status.ok).toBe(true);
    expect(status.data).toMatchObject({ available: true, indexed: false, project: null });
    await expect(backend.search(repo, "add", 10)).rejects.toMatchObject({ code: "not_indexed" });
  });

  it("normalizes CBM search and trace results with auditable provenance", async () => {
    const repo = fixtureRepo();
    const fake = fakeCbm(repo);
    const backend = new CbmSemanticBackend({ cbmBinary: fake.binary });

    const search = await backend.search(repo, "add", 5);
    expect(search.data.symbols[0]).toMatchObject({
      name: "add",
      qualifiedName: "fixture.main.add",
      path: "src/main.ts",
      startLine: 1,
      endLine: 3,
      score: -13.96972048871364,
      inDegree: null,
      outDegree: null
    });
    expect(search.provenance).toMatchObject({
      backend: "codebase-memory",
      backendVersion: "0.10.2",
      authority: "supporting_evidence_only",
      repoRoot: realpathSync(repo),
      project: "fixture",
      indexedAt: "2026-08-12T00:00:00.000Z",
      freshness: "metadata_only"
    });
    expect(search.provenance.fileHashes["src/main.ts"]).toBe(
      createHash("sha256")
        .update(readFileSync(path.join(repo, "src/main.ts")))
        .digest("hex")
    );
    expect(search.provenance.fileHashCoverage).toEqual({
      candidateCount: 1,
      hashedCount: 1,
      limit: 256,
      truncated: false
    });

    const trace = await backend.trace(repo, "fixture.main.add", "both", 3, 100);
    expect(trace.data.callers[0]).toMatchObject({
      qualifiedName: "fixture.caller.callAdd",
      strategy: null,
      confidence: null
    });
    expect(trace.warnings.join(" ")).toContain("omits strategy/confidence");

    const architecture = await backend.architecture(repo);
    expect(architecture.provenance.fileHashes["src/main.ts"]).toBe(
      createHash("sha256")
        .update(readFileSync(path.join(repo, "src/main.ts")))
        .digest("hex")
    );
    expect(readRequests(fake.logPath).find((request) => request.tool === "get_architecture")?.input).toMatchObject({
      project: "fixture",
      format: "json"
    });
  });

  it("reports when returned-file hashing is partial", () => {
    const repo = fixtureRepo();
    const evidence = hashRepoFiles(repo, [
      "src/main.ts",
      ...Array.from({ length: 256 }, (_, index) => `zz-missing/file-${index}.ts`)
    ]);

    expect(evidence.fileHashCoverage).toEqual({
      candidateCount: 257,
      hashedCount: 1,
      limit: 256,
      truncated: true
    });
    expect(Object.keys(evidence.fileHashes)).toEqual(["src/main.ts"]);
  });
});

describe("CBM indexing safety", () => {
  it("always disables artifact persistence", async () => {
    const repo = fixtureRepo();
    initGit(repo);
    const fake = fakeCbm(repo);
    const backend = new CbmSemanticBackend({ cbmBinary: fake.binary });

    const result = await backend.index(repo);
    expect(result.data).toMatchObject({ indexed: true, project: "fixture" });
    const requests = readRequests(fake.logPath);
    const indexRequest = requests.find((request) => request.tool === "index_repository");
    expect(indexRequest?.input).toMatchObject({ repo_path: realpathSync(repo), persistence: false });
  });

  it("rejects repository artifacts before invoking index_repository", async () => {
    const repo = fixtureRepo();
    initGit(repo);
    mkdirSync(path.join(repo, ".codebase-memory"), { recursive: true });
    writeFileSync(path.join(repo, ".codebase-memory", "graph.db.zst"), "shared artifact");
    const fake = fakeCbm(repo);
    const backend = new CbmSemanticBackend({ cbmBinary: fake.binary });

    await expect(backend.index(repo)).rejects.toMatchObject({ code: "artifact_conflict" });
    expect(readRequests(fake.logPath).some((request) => request.tool === "index_repository")).toBe(false);
  });

  it("fails closed when CBM creates an ignored repository artifact", async () => {
    const repo = fixtureRepo();
    initGit(repo);
    writeFileSync(path.join(repo, ".gitignore"), ".codebase-memory/\n");
    git(repo, ["add", ".gitignore"]);
    git(repo, ["commit", "-qm", "ignore CBM artifacts"]);
    const fake = fakeCbm(repo, { createArtifactOnIndex: true });
    const router = new SemanticBackendRouter({ preference: "auto", cbmBinary: fake.binary });

    await expect(router.index(repo)).rejects.toMatchObject({
      code: "worktree_modified",
      details: { artifacts: [".codebase-memory/graph.db.zst"] }
    });
    expect(readFileSync(path.join(repo, ".codebase-memory/graph.db.zst"), "utf8")).toBe("fake artifact\n");
  });

  it("reports worktree mutation and preserves the evidence instead of rolling it back", async () => {
    const repo = fixtureRepo();
    initGit(repo);
    const fake = fakeCbm(repo, { mutateOnIndex: true });
    const backend = new CbmSemanticBackend({ cbmBinary: fake.binary });

    await expect(backend.index(repo)).rejects.toMatchObject({
      code: "worktree_modified",
      details: { changedPaths: ["cbm-index-side-effect.txt"] }
    });
    expect(readFileSync(path.join(repo, "cbm-index-side-effect.txt"), "utf8")).toBe("changed by fake CBM\n");
  });

  it("detects CBM changes to a file that was already dirty", async () => {
    const repo = fixtureRepo();
    initGit(repo);
    writeFileSync(path.join(repo, "src/main.ts"), "user-owned dirty content\n");
    const fake = fakeCbm(repo, { mutateOnIndex: true, mutatePath: "src/main.ts" });
    const backend = new CbmSemanticBackend({ cbmBinary: fake.binary });

    await expect(backend.index(repo)).rejects.toMatchObject({
      code: "worktree_modified",
      details: { changedPaths: ["src/main.ts"] }
    });
    expect(readFileSync(path.join(repo, "src/main.ts"), "utf8")).toBe("changed by fake CBM\n");
  });

  it("fails closed when the worktree cannot be verified after CBM indexing", async () => {
    const repo = fixtureRepo();
    initGit(repo);
    const fake = fakeCbm(repo, { hideGitOnIndex: true });
    const router = new SemanticBackendRouter({ preference: "auto", cbmBinary: fake.binary });

    await expect(router.index(repo)).rejects.toMatchObject({ code: "worktree_unverifiable" });
    expect(existsSync(path.join(repo, ".git-cbm-side-effect"))).toBe(true);
  });

  it("does not hide indexing safety failures behind auto fallback", async () => {
    const repo = fixtureRepo();
    initGit(repo);
    mkdirSync(path.join(repo, ".codebase-memory"), { recursive: true });
    writeFileSync(path.join(repo, ".codebase-memory", "graph.db.zst"), "shared artifact");
    const fake = fakeCbm(repo);
    const router = new SemanticBackendRouter({ preference: "auto", cbmBinary: fake.binary });

    await expect(router.index(repo)).rejects.toMatchObject({ code: "artifact_conflict" });
  });
});

interface FakeOptions {
  version?: string;
  advertisedRoot?: string;
  queryFailure?: "malformed" | "nonzero" | "timeout";
  mutateOnIndex?: boolean;
  mutatePath?: string;
  hideGitOnIndex?: boolean;
  createArtifactOnIndex?: boolean;
}

function fixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-semantic-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/tiny-repo"), root, { recursive: true });
  return root;
}

function fakeCbm(repo: string, options: FakeOptions = {}): { binary: string; logPath: string } {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-fake-cbm-"));
  tempDirs.push(root);
  const binary = path.join(root, "codebase-memory-mcp");
  const logPath = path.join(root, "requests.ndjson");
  const config = {
    version: options.version ?? "0.10.2",
    repo,
    advertisedRoot: options.advertisedRoot ?? repo,
    queryFailure: options.queryFailure ?? null,
    mutateOnIndex: Boolean(options.mutateOnIndex),
    mutatePath: options.mutatePath ?? "cbm-index-side-effect.txt",
    hideGitOnIndex: Boolean(options.hideGitOnIndex),
    createArtifactOnIndex: Boolean(options.createArtifactOnIndex),
    logPath
  };
  writeFileSync(
    binary,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const config = ${JSON.stringify(config)};
const argv = process.argv.slice(2);
if (argv[0] === "--version") {
  process.stdout.write("codebase-memory-mcp " + config.version + "\\n");
  process.exit(0);
}
const tool = argv[argv.length - 1];
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const parsed = input.trim() ? JSON.parse(input) : {};
  fs.appendFileSync(config.logPath, JSON.stringify({ tool, input: parsed }) + "\\n");
  if (tool === "search_graph" && config.queryFailure === "malformed") {
    process.stdout.write("not-json");
    return;
  }
  if (tool === "search_graph" && config.queryFailure === "nonzero") {
    process.stderr.write("fake failure\\n");
    process.exit(7);
  }
  if (tool === "search_graph" && config.queryFailure === "timeout") {
    setTimeout(() => respond({ unreachable: true }), 10_000);
    return;
  }
  if (tool === "index_repository" && config.mutateOnIndex) {
    fs.writeFileSync(path.join(config.repo, config.mutatePath), "changed by fake CBM\\n");
  }
  if (tool === "index_repository" && config.hideGitOnIndex) {
    fs.renameSync(path.join(config.repo, ".git"), path.join(config.repo, ".git-cbm-side-effect"));
  }
  if (tool === "index_repository" && config.createArtifactOnIndex) {
    const artifact = path.join(config.repo, ".codebase-memory", "graph.db.zst");
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, "fake artifact\\n");
  }
  const responses = {
    list_projects: {
      projects: [{ name: "fixture", root_path: config.advertisedRoot, nodes: 12, edges: 8 }]
    },
    index_status: {
      project: "fixture",
      nodes: 12,
      edges: 8,
      status: "ready",
      root_path: config.advertisedRoot,
      git: { head_sha: gitHead(config.repo) },
      parse_partial: { files: [], count: 0, truncated: false },
      skipped: { files: [], count: 0, truncated: false },
      not_indexed: { dirs: [], dirs_count: 0, files: [], files_count: 0, truncated: false }
    },
    index_repository: {
      project: "fixture",
      status: "success",
      nodes: 12,
      edges: 8,
      indexed_at: "2026-08-12T00:00:00.000Z",
      artifact_present: false
    },
    search_graph: {
      total: 1,
      search_mode: "bm25",
      cols: ["qn", "label", "file", "lines", "rank"],
      rows: [["fixture.main.add", "Function", "src/main.ts", "1-3", -13.96972048871364]],
      has_more: false
    },
    trace_path: {
      function: "fixture.main.add",
      direction: "both",
      callees_total: 1,
      callees: { cols: ["name", "hop"], groups: [{ qn_prefix: "fixture.callee", file: "src/math.ts", rows: [["sum", 1]] }] },
      callers_total: 1,
      callers: { cols: ["name", "hop"], groups: [{ qn_prefix: "fixture.caller", file: "src/main.ts", rows: [["callAdd", 1]] }] },
      truncated: false
    },
    get_architecture: {
      project: "fixture",
      total_nodes: 12,
      total_edges: 8,
      entry_points: {
        cols: ["qn", "file"],
        rows: [["fixture.main.add", "src/main.ts"]]
      }
    },
    detect_changes: {
      base: "main",
      merge_base: null,
      direction: "inbound",
      changed_files: ["src/main.ts"],
      seed_symbols: [],
      impacted_total: 0,
      impacted_shown: 0,
      impacted: [],
      impacted_modules: [],
      truncated: false
    },
    check_index_coverage: {
      signal: "best_effort",
      indexed_at: "2026-08-12T00:00:00.000Z",
      paths: (parsed.paths || []).map((file) => ({
        requested_path: file,
        path: file,
        status: "no_recorded_issue",
        freshness: "metadata_match",
        recommended_action: "use_graph_with_best_effort_caveat",
        coverage: []
      })),
      scopes: [],
      caveat: "Best-effort signal only."
    }
  };
  respond(responses[tool] || { error: "unknown fake tool" }, !responses[tool]);
});
function respond(payload, isError = false) {
  process.stdout.write(JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError
  }));
}
function gitHead(cwd) {
  try {
    return require("node:child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}
`
  );
  chmodSync(binary, 0o755);
  return { binary, logPath };
}

function initGit(repo: string): void {
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.name", "ProjectNavigator Tests"]);
  git(repo, ["config", "user.email", "pnav-tests@example.invalid"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "fixture"]);
}

function git(repo: string, args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

function readRequests(logPath: string): Array<{ tool: string; input: Record<string, unknown> }> {
  try {
    return readFileSync(logPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { tool: string; input: Record<string, unknown> });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
