import { cpSync, mkdtempSync, rmSync } from "node:fs";
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

    const client = new Client({ name: "pnav-test-client", version: "0.1.0" });
    const server = createMcpServer(repo);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name).sort();
      expect(toolNames).toEqual([
        "analyze_guard_output",
        "analyze_source_doc",
        "find_related_files",
        "find_symbol",
        "git_worktree_status",
        "impact_analysis",
        "prepare_task_context",
        "related_tests",
        "remember_task",
        "repo_map",
        "search_project_memory",
        "trace_route"
      ]);

      const calls: Array<[string, Record<string, unknown>]> = [
        ["repo_map", {}],
        ["find_symbol", { query: "add" }],
        ["find_related_files", { task: "add test" }],
        ["trace_route", { query: "/" }],
        ["impact_analysis", { target: "src/main.ts", depth: 2 }],
        ["related_tests", { changedFiles: ["src/main.ts"], task: "add" }],
        ["prepare_task_context", { task: "add auth test", maxFiles: 5, maxSymbols: 5 }],
        ["analyze_source_doc", { source_doc: "AGENTS.md" }],
        ["analyze_guard_output", { output: "src/main.ts:1 bad", command: "npm test" }],
        ["git_worktree_status", {}],
        [
          "remember_task",
          { title: "Add auth test", summary: "Stored from MCP test", changedFiles: ["src/main.ts"], tags: ["test"] }
        ],
        ["search_project_memory", { query: "auth test" }]
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
  }, 15_000);
});
