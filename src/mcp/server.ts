import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { prepareTaskContext } from "../capsule/prepareTaskContext.js";
import { discoverCode } from "../discovery/discoverCode.js";
import { duplicateClusters } from "../discovery/duplicateClusters.js";
import { findEntrypoints } from "../discovery/entrypoints.js";
import { explainReuse } from "../discovery/explainReuse.js";
import { traceFeature } from "../discovery/featureTracer.js";
import { moduleMap } from "../discovery/moduleMap.js";
import { findReusableComponents, findSimilarCode } from "../discovery/reuse.js";
import { findCallers, findCallees, traceSymbol } from "../discovery/symbolGraph.js";
import { whyRelated } from "../discovery/whyRelated.js";
import { runDiscoveryEval } from "../eval/evalRunner.js";
import { loadSourceDoc } from "../docs/sourceDocQuery.js";
import { getWorktreeStatus } from "../git/worktreeStatus.js";
import { impactAnalysis } from "../graph/impactAnalysis.js";
import { impactAnalysisV2 } from "../graph/impactAnalysisV2.js";
import { impactAnalysisV3 } from "../graph/impactAnalysisV3.js";
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
import { SemanticBackendRouter } from "../semantic/backendRouter.js";
import type { SemanticBackendOptions } from "../semantic/types.js";
import { auditTaskResult } from "../tasks/taskAudit.js";
import { toolResponse } from "./response.js";

export async function startMcpServer(repoPath: string, options: SemanticBackendOptions = {}): Promise<void> {
  const server = createMcpServer(repoPath, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createMcpServer(repoPath: string, options: SemanticBackendOptions = {}): McpServer {
  const server = new McpServer({
    name: "project-navigator-mcp",
    version: PACKAGE_VERSION
  });
  const semanticBackend = new SemanticBackendRouter(options);

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
        includeDebug: z.boolean().optional(),
        mode: z.enum(["auto", "discovery", "repair"]).optional()
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
            includeDebug: input.includeDebug ?? input.include_debug,
            mode: input.mode
          })
        )
      )
  );

  server.registerTool(
    "discover_code",
    {
      description:
        "Discovery Mode: find entrypoints, reusable code, callgraph hints, impact preview, and why-related evidence.",
      inputSchema: {
        task: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ task, limit }) => textJson(toolResponse(repoPath, discoverCode(repoPath, task, limit ?? 15)))
  );

  server.registerTool(
    "find_entrypoints",
    {
      description: "Find likely code entrypoints for a natural language task.",
      inputSchema: {
        task: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ task, limit }) => textJson(toolResponse(repoPath, findEntrypoints(repoPath, task, limit ?? 10)))
  );

  server.registerTool(
    "trace_feature",
    {
      description: "Trace a feature from entrypoint to implementation, reuse candidates, and tests.",
      inputSchema: {
        task: z.string(),
        limit: z.number().int().positive().max(20).optional()
      }
    },
    async ({ task, limit }) => textJson(toolResponse(repoPath, traceFeature(repoPath, task, limit ?? 5)))
  );

  server.registerTool(
    "find_callers",
    {
      description: "Find callers of a symbol, qualified symbol, or file path.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ query, limit }) => textJson(toolResponse(repoPath, findCallers(repoPath, query, limit ?? 20)))
  );

  server.registerTool(
    "find_callees",
    {
      description: "Find callees of a symbol, qualified symbol, or file path.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ query, limit }) => textJson(toolResponse(repoPath, findCallees(repoPath, query, limit ?? 20)))
  );

  server.registerTool(
    "trace_symbol",
    {
      description: "Trace callers and callees around a symbol.",
      inputSchema: {
        query: z.string()
      }
    },
    async ({ query }) => textJson(toolResponse(repoPath, traceSymbol(repoPath, query)))
  );

  server.registerTool(
    "find_similar_code",
    {
      description: "Find similar code blocks for a symbol, qualified symbol, or file path.",
      inputSchema: {
        target: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ target, limit }) => textJson(toolResponse(repoPath, findSimilarCode(repoPath, target, limit ?? 10)))
  );

  server.registerTool(
    "find_reusable_components",
    {
      description: "Find reusable components or duplicate risks for a task.",
      inputSchema: {
        task: z.string(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ task, limit }) => textJson(toolResponse(repoPath, findReusableComponents(repoPath, task, limit ?? 10)))
  );

  server.registerTool(
    "module_map",
    {
      description: "Return modules with entrypoints, core files, dependencies, tests, and duplicate clusters.",
      inputSchema: {
        scope: z.string().optional(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ scope, limit }) => textJson(toolResponse(repoPath, moduleMap(repoPath, scope ?? "", limit ?? 30)))
  );

  server.registerTool(
    "duplicate_clusters",
    {
      description: "Return persisted duplicate code clusters from the local index.",
      inputSchema: {
        scope: z.string().optional(),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ scope, limit }) => textJson(toolResponse(repoPath, duplicateClusters(repoPath, scope ?? "", limit ?? 20)))
  );

  server.registerTool(
    "explain_reuse",
    {
      description: "Explain reusable implementations and duplicate clusters for a task.",
      inputSchema: {
        task: z.string(),
        limit: z.number().int().positive().max(50).optional()
      }
    },
    async ({ task, limit }) => textJson(toolResponse(repoPath, explainReuse(repoPath, task, limit ?? 5)))
  );

  server.registerTool(
    "why_related",
    {
      description: "Explain why a file is related to a task using evidence chains.",
      inputSchema: {
        target: z.string(),
        task: z.string()
      }
    },
    async ({ target, task }) => textJson(toolResponse(repoPath, whyRelated(repoPath, target, task)))
  );

  server.registerTool(
    "impact_analysis_v2",
    {
      description: "Symbol-aware impact analysis with callers, callees, entrypoints, tests, and reuse risks.",
      inputSchema: {
        query: z.string(),
        includeTests: z.boolean().optional(),
        includeEntrypoints: z.boolean().optional(),
        includeReuseRisks: z.boolean().optional()
      }
    },
    async ({ query, includeTests, includeEntrypoints, includeReuseRisks }) =>
      textJson(
        toolResponse(
          repoPath,
          impactAnalysisV2(repoPath, query, { includeTests, includeEntrypoints, includeReuseRisks })
        )
      )
  );

  server.registerTool(
    "impact_analysis_v3",
    {
      description: "Production impact analysis with UI composition, critical impact layers, and risk level.",
      inputSchema: {
        query: z.string(),
        task: z.string().optional()
      }
    },
    async ({ query, task }) => textJson(toolResponse(repoPath, impactAnalysisV3(repoPath, query, task ?? query)))
  );

  server.registerTool(
    "production_discovery_eval",
    {
      description: "Run a production discovery eval suite from a local JSON file.",
      inputSchema: {
        suitePath: z.string(),
        strict: z.boolean().optional(),
        metadataOnly: z.boolean().optional(),
        allowStaleCodeGraph: z.boolean().optional()
      }
    },
    async ({ suitePath, strict, metadataOnly, allowStaleCodeGraph }) =>
      textJson(
        toolResponse(
          repoPath,
          runDiscoveryEval(repoPath, suitePath, {
            strict: strict ?? false,
            metadataOnly: metadataOnly ?? false,
            allowStaleCodeGraph: allowStaleCodeGraph ?? false
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

  server.registerTool(
    "audit_task_result",
    {
      description: "Audit current diff against a v0.4 task session boundary and validation results.",
      inputSchema: {
        taskSessionId: z.string().optional(),
        task_session_id: z.string().optional(),
        validationResults: z.array(z.object({ command: z.string(), result: z.string() })).optional(),
        validation_results: z.array(z.object({ command: z.string(), result: z.string() })).optional()
      }
    },
    async (input) =>
      textJson(
        toolResponse(
          repoPath,
          auditTaskResult(repoPath, {
            taskSessionId: input.taskSessionId ?? input.task_session_id ?? "",
            validationResults: input.validationResults ?? input.validation_results ?? []
          })
        )
      )
  );

  server.registerTool(
    "semantic_backend_status",
    {
      description:
        "Report the selected semantic evidence backend. Results are supporting evidence only and never control mustRead or edit boundaries.",
      inputSchema: {}
    },
    async () => semanticToolResponse(repoPath, await semanticBackend.status(repoPath))
  );

  server.registerTool(
    "semantic_index",
    {
      description:
        "Build or refresh the selected semantic evidence index. CBM indexing disables repository artifact persistence and checks for worktree changes.",
      inputSchema: {}
    },
    async () => semanticToolResponse(repoPath, await semanticBackend.index(repoPath))
  );

  server.registerTool(
    "semantic_search",
    {
      description:
        "Search symbols through the selected semantic backend as supporting evidence; ProjectNavigator handoff ranking remains authoritative.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().max(100).optional()
      }
    },
    async ({ query, limit }) =>
      semanticToolResponse(repoPath, await semanticBackend.search(repoPath, query, limit ?? 20))
  );

  server.registerTool(
    "semantic_trace",
    {
      description:
        "Trace callers and callees through the selected semantic backend as non-authoritative structural evidence.",
      inputSchema: {
        query: z.string().min(1),
        direction: z.enum(["inbound", "outbound", "both"]).optional(),
        depth: z.number().int().positive().max(10).optional(),
        limit: z.number().int().positive().max(500).optional()
      }
    },
    async ({ query, direction, depth, limit }) =>
      semanticToolResponse(
        repoPath,
        await semanticBackend.trace(repoPath, query, direction ?? "both", depth ?? 3, limit ?? 100)
      )
  );

  server.registerTool(
    "semantic_architecture",
    {
      description: "Return a high-level structural overview from the selected semantic backend as supporting evidence.",
      inputSchema: {
        scope: z.string().optional()
      }
    },
    async ({ scope }) => semanticToolResponse(repoPath, await semanticBackend.architecture(repoPath, scope))
  );

  server.registerTool(
    "semantic_detect_changes",
    {
      description:
        "Map Git changes to structural impact evidence without changing ProjectNavigator's edit boundary or completion proof.",
      inputSchema: {
        base_branch: z.string().optional(),
        baseBranch: z.string().optional()
      }
    },
    async ({ base_branch, baseBranch }) =>
      semanticToolResponse(repoPath, await semanticBackend.detectChanges(repoPath, baseBranch ?? base_branch))
  );

  return server;
}

function semanticToolResponse<T extends { warnings: string[] }>(
  repoPath: string,
  result: T
): { content: Array<{ type: "text"; text: string }> } {
  return textJson(toolResponse(repoPath, result, result.warnings));
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
