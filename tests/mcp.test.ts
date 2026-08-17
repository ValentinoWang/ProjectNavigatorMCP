import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/server.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-mcp-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/tiny-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("MCP server", () => {
  it("registers the documented tools and returns the shared envelope", async () => {
    const repo = copyFixtureRepo();
    scanRepo(repo);
    const suitePath = path.join(repo, ".pnav", "mcp-eval-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [
          {
            id: "mcp-smoke",
            task: "add auth test",
            expected: { mustReadAny: ["src/main.ts"], mustNotRead: ["backend/**"] }
          }
        ]
      })
    );

    const client = new Client({ name: "pnav-test-client", version: "0.1.0" });
    const server = createMcpServer(repo, { preference: "builtin" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name).sort();
      expect(toolNames).toEqual([
        "analyze_guard_output",
        "analyze_source_doc",
        "audit_task_result",
        "discover_code",
        "duplicate_clusters",
        "explain_guard_rule",
        "explain_reuse",
        "find_callees",
        "find_callers",
        "find_entrypoints",
        "find_related_files",
        "find_reusable_components",
        "find_similar_code",
        "find_symbol",
        "git_worktree_status",
        "impact_analysis",
        "impact_analysis_v2",
        "impact_analysis_v3",
        "module_map",
        "prepare_task_context",
        "production_discovery_eval",
        "record_task_result",
        "related_tests",
        "remember_task",
        "repo_map",
        "search_project_memory",
        "semantic_architecture",
        "semantic_backend_status",
        "semantic_detect_changes",
        "semantic_index",
        "semantic_search",
        "semantic_trace",
        "trace_feature",
        "trace_route",
        "trace_symbol",
        "why_related"
      ]);

      const calls: Array<[string, Record<string, unknown>]> = [
        ["repo_map", {}],
        ["discover_code", { task: "add auth test" }],
        ["trace_feature", { task: "add auth test" }],
        ["duplicate_clusters", {}],
        ["explain_reuse", { task: "add auth test" }],
        ["find_entrypoints", { task: "add auth test" }],
        ["find_callers", { query: "add" }],
        ["find_callees", { query: "add" }],
        ["trace_symbol", { query: "add" }],
        ["find_similar_code", { target: "add" }],
        ["find_reusable_components", { task: "add auth test" }],
        ["module_map", {}],
        ["why_related", { target: "src/main.ts", task: "add auth test" }],
        ["impact_analysis_v2", { query: "add" }],
        ["impact_analysis_v3", { query: "add" }],
        ["production_discovery_eval", { suitePath }],
        ["find_symbol", { query: "add" }],
        ["find_related_files", { task: "add test" }],
        ["trace_route", { query: "/" }],
        ["impact_analysis", { target: "src/main.ts", depth: 2 }],
        ["related_tests", { changedFiles: ["src/main.ts"], task: "add" }],
        ["prepare_task_context", { task: "add auth test", maxFiles: 5, maxSymbols: 5 }],
        ["analyze_source_doc", { source_doc: "AGENTS.md" }],
        ["analyze_guard_output", { output: "src/main.ts:1 bad", command: "npm test" }],
        ["audit_task_result", { validationResults: [{ command: "npm test", result: "passed" }] }],
        ["explain_guard_rule", { rule: "DS-BREAKPOINT", output: "[DS-BREAKPOINT] raw width" }],
        ["git_worktree_status", {}],
        [
          "remember_task",
          { title: "Add auth test", summary: "Stored from MCP test", changedFiles: ["src/main.ts"], tags: ["test"] }
        ],
        ["record_task_result", { title: "Record test result", task: "auth test", result: "passed" }],
        ["search_project_memory", { query: "auth test" }],
        ["semantic_backend_status", {}],
        ["semantic_index", {}],
        ["semantic_search", { query: "add" }],
        ["semantic_trace", { query: "add", direction: "both" }],
        ["semantic_architecture", {}],
        ["semantic_detect_changes", { base_branch: "main" }]
      ];

      for (const [name, args] of calls) {
        const result = await client.callTool({ name, arguments: args });
        const first = result.content[0];
        expect(first.type).toBe("text");
        if (first.type !== "text") {
          throw new Error("Expected text content");
        }
        const parsed = JSON.parse(first.text) as Record<string, unknown>;
        expect(parsed).toHaveProperty("repo", path.basename(repo));
        expect(parsed).toHaveProperty("generated_at");
        expect(parsed).toHaveProperty("index_status");
        expect(parsed).toHaveProperty("data");
        expect(parsed).toHaveProperty("warnings");
      }
    } finally {
      await client.close();
      await server.close();
    }
  }, 45_000);
});
