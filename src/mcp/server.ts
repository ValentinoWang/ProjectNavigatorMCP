import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { prepareTaskContext } from "../capsule/prepareTaskContext.js";
import { impactAnalysis } from "../graph/impactAnalysis.js";
import { findRelatedFiles } from "../graph/relatedFiles.js";
import { relatedTests } from "../graph/relatedTests.js";
import { getRepoMap } from "../graph/repoMap.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { traceRoute } from "../graph/traceRoute.js";
import { rememberTask, searchProjectMemory } from "../memory/memory.js";
import { PACKAGE_VERSION } from "../shared/packageInfo.js";

export async function startMcpServer(repoPath: string): Promise<void> {
  const server = createMcpServer(repoPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createMcpServer(repoPath: string): McpServer {
  const server = new McpServer({
    name: "project-navigator-mcp",
    version: PACKAGE_VERSION
  });

  server.registerTool("repo_map", {
    description: "Return a compact repository map with file counts, commands, paths, and scan status.",
    inputSchema: {}
  }, async () => textJson(getRepoMap(repoPath)));

  server.registerTool("find_symbol", {
    description: "Find symbols by name, file path, or task wording.",
    inputSchema: {
      query: z.string(),
      limit: z.number().int().positive().max(100).optional()
    }
  }, async ({ query, limit }) => textJson({ matches: findSymbol(repoPath, query, limit ?? 20) }));

  server.registerTool("find_related_files", {
    description: "Find files likely related to a natural language task.",
    inputSchema: {
      task: z.string(),
      limit: z.number().int().positive().max(100).optional()
    }
  }, async ({ task, limit }) => textJson(findRelatedFiles(repoPath, task, limit ?? 20)));

  server.registerTool("trace_route", {
    description: "Trace Flutter GoRouter routes or FastAPI endpoints.",
    inputSchema: {
      query: z.string(),
      limit: z.number().int().positive().max(100).optional()
    }
  }, async ({ query, limit }) => textJson({ routes: traceRoute(repoPath, query, limit ?? 20) }));

  server.registerTool("impact_analysis", {
    description: "Estimate impacted files and risks for a changed file.",
    inputSchema: {
      target: z.string(),
      depth: z.number().int().positive().max(5).optional()
    }
  }, async ({ target, depth }) => textJson(impactAnalysis(repoPath, target, depth ?? 2)));

  server.registerTool("related_tests", {
    description: "Recommend tests and validation commands for changed files or a task.",
    inputSchema: {
      changedFiles: z.array(z.string()).optional(),
      task: z.string().optional()
    }
  }, async ({ changedFiles, task }) => textJson(relatedTests(repoPath, changedFiles ?? [], task ?? "")));

  server.registerTool("prepare_task_context", {
    description: "Prepare a compact task context capsule for Codex or Claude Code.",
    inputSchema: {
      task: z.string()
    }
  }, async ({ task }) => textJson(prepareTaskContext(repoPath, task)));

  server.registerTool("search_project_memory", {
    description: "Search prior task memories stored in the project-local SQLite index.",
    inputSchema: {
      query: z.string(),
      limit: z.number().int().positive().max(50).optional()
    }
  }, async ({ query, limit }) => textJson({ memories: searchProjectMemory(repoPath, query, limit ?? 10) }));

  server.registerTool("remember_task", {
    description: "Store a completed task summary in project memory.",
    inputSchema: {
      title: z.string(),
      summary: z.string(),
      changedFiles: z.array(z.string()).optional(),
      tests: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional()
    }
  }, async (input) => textJson(rememberTask(repoPath, input)));

  return server;
}

function textJson(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

