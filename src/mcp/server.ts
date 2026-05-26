import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { prepareTaskContext } from "../capsule/prepareTaskContext.js";
import { loadSourceDoc } from "../docs/sourceDocQuery.js";
import { getWorktreeStatus } from "../git/worktreeStatus.js";
import { impactAnalysis } from "../graph/impactAnalysis.js";
import { findRelatedFiles } from "../graph/relatedFiles.js";
import { relatedTests } from "../graph/relatedTests.js";
import { getRepoMap } from "../graph/repoMap.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { traceRoute } from "../graph/traceRoute.js";
import { analyzeGuardOutput } from "../guard/analyzeGuardOutput.js";
import { explainGuardRule } from "../guard/ruleRegistry.js";
import { rememberTask, searchProjectMemory } from "../memory/memory.js";
import { recordTaskResult } from "../memory/recordTaskResult.js";
import { PACKAGE_VERSION } from "../shared/packageInfo.js";
import { toolResponse } from "./response.js";

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

  server.registerTool(
    "repo_map",
    {
      description: "Return a compact repository map with file counts, commands, paths, and scan status.",
      inputSchema: {}
    },
    async () => textJson(toolResponse(repoPath, getRepoMap(repoPath)))
  );

  server.registerTool(
    "find_symbol",
    {
      description: "Find symbols by name, file path, or task wording.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ query, limit }) => textJson(toolResponse(repoPath, { matches: findSymbol(repoPath, query, limit ?? 20) }))
  );

  server.registerTool(
    "find_related_files",
    {
      description: "Find files likely related to a natural language task.",
      inputSchema: {
        task: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ task, limit }) => textJson(toolResponse(repoPath, findRelatedFiles(repoPath, task, limit ?? 20)))
  );

  server.registerTool(
    "trace_route",
    {
      description: "Trace Flutter GoRouter routes or FastAPI endpoints.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ query, limit }) => textJson(toolResponse(repoPath, { routes: traceRoute(repoPath, query, limit ?? 20) }))
  );

  server.registerTool(
    "impact_analysis",
    {
      description: "Estimate impacted files and risks for a changed file.",
      inputSchema: {
        target: z.string(),
        depth: z.number().int().positive().max(5).optional(),
        direction: z.enum(["upstream", "downstream", "both"]).optional()
      }
    },
    async ({ target, depth, direction }) =>
      textJson(toolResponse(repoPath, impactAnalysis(repoPath, target, depth ?? 2, direction ?? "both")))
  );

  server.registerTool(
    "related_tests",
    {
      description: "Recommend tests and validation commands for changed files or a task.",
      inputSchema: {
        changedFiles: z.array(z.string()).optional(),
        task: z.string().optional()
      }
    },
    async ({ changedFiles, task }) =>
      textJson(toolResponse(repoPath, relatedTests(repoPath, changedFiles ?? [], task ?? "")))
  );

  server.registerTool(
    "prepare_task_context",
    {
      description: "Prepare a compact task context capsule for Codex or Claude Code.",
      inputSchema: {
        task: z.string(),
        source_doc: z.string().optional(),
        sourceDoc: z.string().optional(),
        guard_output: z.string().optional(),
        guardOutput: z.string().optional(),
        guard_command: z.string().optional(),
        guardCommand: z.string().optional(),
        changed_files: z.array(z.string()).optional(),
        changedFiles: z.array(z.string()).optional(),
        maxFiles: z.number().int().positive().max(100).optional(),
        max_files: z.number().int().positive().max(100).optional(),
        maxSymbols: z.number().int().positive().max(100).optional(),
        max_symbols: z.number().int().positive().max(100).optional(),
        includeMemory: z.boolean().optional(),
        include_memory: z.boolean().optional(),
        includeRules: z.boolean().optional(),
        include_rules: z.boolean().optional(),
        include_dirty_status: z.boolean().optional(),
        includeDirtyStatus: z.boolean().optional(),
        domain_hint: z.string().optional(),
        domainHint: z.string().optional(),
        plan_max_steps: z.number().int().positive().max(20).optional(),
        planMaxSteps: z.number().int().positive().max(20).optional(),
        include_debug: z.boolean().optional(),
        includeDebug: z.boolean().optional()
      }
    },
    async (input) =>
      textJson(
        toolResponse(
          repoPath,
          prepareTaskContext(repoPath, input.task, {
            sourceDoc: input.sourceDoc ?? input.source_doc,
            guardOutput: input.guardOutput ?? input.guard_output,
            guardCommand: input.guardCommand ?? input.guard_command,
            changedFiles: input.changedFiles ?? input.changed_files,
            maxFiles: input.maxFiles ?? input.max_files,
            maxSymbols: input.maxSymbols ?? input.max_symbols,
            includeMemory: input.includeMemory ?? input.include_memory,
            includeRules: input.includeRules ?? input.include_rules,
            includeDirtyStatus: input.includeDirtyStatus ?? input.include_dirty_status,
            domainHint: input.domainHint ?? input.domain_hint,
            planMaxSteps: input.planMaxSteps ?? input.plan_max_steps,
            includeDebug: input.includeDebug ?? input.include_debug
          })
        )
      )
  );

  server.registerTool(
    "analyze_source_doc",
    {
      description: "Analyze a Markdown source document and return frontmatter targets and execution steps.",
      inputSchema: {
        source_doc: z.string(),
        sourceDoc: z.string().optional()
      }
    },
    async ({ source_doc, sourceDoc }) =>
      textJson(toolResponse(repoPath, loadSourceDoc(repoPath, sourceDoc ?? source_doc)))
  );

  server.registerTool(
    "analyze_guard_output",
    {
      description: "Parse guard output into findings, likely fix files, actions, and validation commands.",
      inputSchema: {
        output: z.string(),
        command: z.string().optional(),
        source_doc: z.string().optional(),
        sourceDoc: z.string().optional()
      }
    },
    async ({ output, command, source_doc, sourceDoc }) =>
      textJson(
        toolResponse(
          repoPath,
          analyzeGuardOutput(repoPath, output, {
            command,
            sourceDoc: sourceDoc ?? source_doc
          })
        )
      )
  );

  server.registerTool(
    "explain_guard_rule",
    {
      description: "Explain a guard rule and return its canonical paths, validation commands, and repair recipe.",
      inputSchema: {
        rule: z.string().optional(),
        command: z.string().optional(),
        output: z.string().optional()
      }
    },
    async (input) => textJson(toolResponse(repoPath, explainGuardRule(repoPath, input)))
  );

  server.registerTool(
    "git_worktree_status",
    {
      description: "Return dirty worktree status and warnings for safe minimal edits.",
      inputSchema: {}
    },
    async () => textJson(toolResponse(repoPath, getWorktreeStatus(repoPath)))
  );

  server.registerTool(
    "search_project_memory",
    {
      description: "Search prior task memories stored in the project-local SQLite index.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(50).optional()
      }
    },
    async ({ query, limit }) =>
      textJson(toolResponse(repoPath, { memories: searchProjectMemory(repoPath, query, limit ?? 10) }))
  );

  server.registerTool(
    "remember_task",
    {
      description: "Store a completed task summary in project memory.",
      inputSchema: {
        title: z.string(),
        summary: z.string(),
        changedFiles: z.array(z.string()).optional(),
        tests: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        decisions: z.array(z.string()).optional(),
        pitfalls: z.array(z.string()).optional(),
        validation: z.array(z.string()).optional()
      }
    },
    async (input) => textJson(toolResponse(repoPath, rememberTask(repoPath, input)))
  );

  server.registerTool(
    "record_task_result",
    {
      description: "Record a completed guarded task result into project memory and task_runs.",
      inputSchema: {
        title: z.string(),
        task: z.string().optional(),
        source_doc: z.string().optional(),
        sourceDoc: z.string().optional(),
        guard_output: z.string().optional(),
        guardOutput: z.string().optional(),
        guard_command: z.string().optional(),
        guardCommand: z.string().optional(),
        validations: z.array(z.string()).optional(),
        validation: z.array(z.string()).optional(),
        result: z.string().optional(),
        summary: z.string().optional()
      }
    },
    async (input) =>
      textJson(
        toolResponse(
          repoPath,
          recordTaskResult(repoPath, {
            title: input.title,
            task: input.task,
            sourceDoc: input.sourceDoc ?? input.source_doc,
            guardOutput: input.guardOutput ?? input.guard_output,
            guardCommand: input.guardCommand ?? input.guard_command,
            validations: input.validations ?? input.validation ?? [],
            result: input.result,
            summary: input.summary
          })
        )
      )
  );

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
