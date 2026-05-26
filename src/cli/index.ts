#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { prepareTaskContext } from "../capsule/prepareTaskContext.js";
import { renderCapsule } from "../capsule/renderCapsule.js";
import { discoverCode } from "../discovery/discoverCode.js";
import { findEntrypoints } from "../discovery/entrypoints.js";
import { moduleMap } from "../discovery/moduleMap.js";
import { findReusableComponents, findSimilarCode } from "../discovery/reuse.js";
import { findCallers, findCallees, traceSymbol } from "../discovery/symbolGraph.js";
import { whyRelated } from "../discovery/whyRelated.js";
import { analyzeGuardOutput } from "../guard/analyzeGuardOutput.js";
import { explainGuardRule } from "../guard/ruleRegistry.js";
import { getWorktreeStatus } from "../git/worktreeStatus.js";
import { impactAnalysisV2 } from "../graph/impactAnalysisV2.js";
import { getRepoMap, renderRepoMap } from "../graph/repoMap.js";
import { startMcpServer } from "../mcp/server.js";
import { rememberTask, searchProjectMemory } from "../memory/memory.js";
import { recordTaskResult } from "../memory/recordTaskResult.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { getDoctorReport, renderDoctorReport } from "./commands/doctor.js";
import { initProject, renderInitResult } from "./commands/init.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../shared/packageInfo.js";
import { auditTaskResult } from "../tasks/taskAudit.js";

const program = new Command();

program.name("pnav").description("Local Repository Intelligence MCP CLI").version(PACKAGE_VERSION);

program
  .command("doctor")
  .description("Check local ProjectNavigatorMCP prerequisites")
  .action(() => {
    console.log(renderDoctorReport(getDoctorReport()));
  });

program
  .command("init")
  .description("Initialize ProjectNavigatorMCP metadata in a repository")
  .argument("<repo>", "Target repository path")
  .action((repo: string) => {
    console.log(renderInitResult(initProject(repo)));
  });

program
  .command("scan")
  .description("Scan a repository into its local .pnav index")
  .argument("<repo>", "Target repository path")
  .action((repo: string) => {
    const result = scanRepo(repo);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("map")
  .description("Print a compact repository map")
  .argument("<repo>", "Target repository path")
  .action((repo: string) => {
    console.log(renderRepoMap(getRepoMap(repo)));
  });

program
  .command("capsule")
  .description("Prepare a task context capsule")
  .argument("<repo>", "Target repository path")
  .argument("<task>", "Task description")
  .option("--source-doc <path>", "Source Markdown document path")
  .option("--guard-log <file>", "Guard output log file")
  .option("--guard-command <command>", "Command that produced the guard output")
  .option("--changed-file <file...>", "Explicit changed file")
  .option("--domain-hint <domain>", "Optional task domain hint")
  .option("--plan-max-steps <number>", "Maximum execution plan steps", "8")
  .option("--mode <mode>", "Task context mode: auto, discovery, or repair", "auto")
  .action(
    (
      repo: string,
      task: string,
      options: {
        sourceDoc?: string;
        guardLog?: string;
        guardCommand?: string;
        changedFile?: string[];
        domainHint?: string;
        planMaxSteps?: string;
        mode?: "auto" | "discovery" | "repair";
      }
    ) => {
      console.log(
        renderCapsule(
          prepareTaskContext(repo, task, {
            sourceDoc: options.sourceDoc,
            guardOutput: options.guardLog ? readFileSync(options.guardLog, "utf8") : undefined,
            guardCommand: options.guardCommand,
            changedFiles: options.changedFile ?? [],
            domainHint: options.domainHint,
            planMaxSteps: Number(options.planMaxSteps ?? "8"),
            mode: options.mode
          })
        )
      );
    }
  );

program
  .command("discover")
  .description("Discover entrypoints, reusable code, callgraph hints, and related files for a task")
  .argument("<repo>", "Target repository path")
  .argument("<task>", "Task description")
  .option("-l, --limit <number>", "Maximum read-order files", "15")
  .action((repo: string, task: string, options: { limit: string }) => {
    console.log(JSON.stringify(discoverCode(repo, task, Number(options.limit)), null, 2));
  });

program
  .command("entrypoints")
  .description("Find likely entrypoints for a task")
  .argument("<repo>", "Target repository path")
  .argument("<task>", "Task description")
  .option("-l, --limit <number>", "Maximum entrypoints", "10")
  .action((repo: string, task: string, options: { limit: string }) => {
    console.log(JSON.stringify(findEntrypoints(repo, task, Number(options.limit)), null, 2));
  });

program
  .command("callers")
  .description("Find callers of a symbol")
  .argument("<repo>", "Target repository path")
  .argument("<symbol>", "Symbol, qualified symbol, or file path")
  .option("-l, --limit <number>", "Maximum callers", "20")
  .action((repo: string, symbol: string, options: { limit: string }) => {
    console.log(JSON.stringify(findCallers(repo, symbol, Number(options.limit)), null, 2));
  });

program
  .command("callees")
  .description("Find callees of a symbol")
  .argument("<repo>", "Target repository path")
  .argument("<symbol>", "Symbol, qualified symbol, or file path")
  .option("-l, --limit <number>", "Maximum callees", "20")
  .action((repo: string, symbol: string, options: { limit: string }) => {
    console.log(JSON.stringify(findCallees(repo, symbol, Number(options.limit)), null, 2));
  });

program
  .command("trace-symbol")
  .description("Trace callers and callees around a symbol")
  .argument("<repo>", "Target repository path")
  .argument("<symbol>", "Symbol, qualified symbol, or file path")
  .action((repo: string, symbol: string) => {
    console.log(JSON.stringify(traceSymbol(repo, symbol), null, 2));
  });

program
  .command("similar")
  .description("Find similar code blocks for a symbol or file")
  .argument("<repo>", "Target repository path")
  .argument("<target>", "Symbol, qualified symbol, or file path")
  .option("-l, --limit <number>", "Maximum matches", "10")
  .action((repo: string, target: string, options: { limit: string }) => {
    console.log(JSON.stringify(findSimilarCode(repo, target, Number(options.limit)), null, 2));
  });

program
  .command("reuse")
  .description("Find reusable components or duplicate risks for a task")
  .argument("<repo>", "Target repository path")
  .argument("<task>", "Task description")
  .option("-l, --limit <number>", "Maximum matches", "10")
  .action((repo: string, task: string, options: { limit: string }) => {
    console.log(JSON.stringify(findReusableComponents(repo, task, Number(options.limit)), null, 2));
  });

program
  .command("modules")
  .description("Print module map")
  .argument("<repo>", "Target repository path")
  .argument("[scope]", "Optional module scope")
  .option("-l, --limit <number>", "Maximum modules", "30")
  .action((repo: string, scope: string | undefined, options: { limit: string }) => {
    console.log(JSON.stringify(moduleMap(repo, scope ?? "", Number(options.limit)), null, 2));
  });

program
  .command("why")
  .description("Explain why a file is related to a task")
  .argument("<repo>", "Target repository path")
  .argument("<path>", "Target file path")
  .requiredOption("--task <task>", "Task description")
  .action((repo: string, targetPath: string, options: { task: string }) => {
    console.log(JSON.stringify(whyRelated(repo, targetPath, options.task), null, 2));
  });

program
  .command("impact-v2")
  .description("Run symbol-aware impact analysis")
  .argument("<repo>", "Target repository path")
  .argument("<target>", "File, route, or symbol target")
  .action((repo: string, target: string) => {
    console.log(JSON.stringify(impactAnalysisV2(repo, target), null, 2));
  });

program
  .command("memory")
  .description("Search project memory")
  .argument("<repo>", "Target repository path")
  .argument("<query>", "Memory search query")
  .option("-l, --limit <number>", "Maximum memories", "10")
  .action((repo: string, query: string, options: { limit: string }) => {
    console.log(JSON.stringify({ memories: searchProjectMemory(repo, query, Number(options.limit)) }, null, 2));
  });

program
  .command("explain-guard")
  .description("Explain a guard rule and return its repair recipe")
  .argument("<repo>", "Target repository path")
  .option("--rule <rule>", "Rule id from guard output")
  .option("--command <command>", "Command that produced the output")
  .option("--output <text>", "Guard output text")
  .action((repo: string, options: { rule?: string; command?: string; output?: string }) => {
    console.log(JSON.stringify(explainGuardRule(repo, options), null, 2));
  });

program
  .command("finish")
  .description("Record a completed task result in project memory")
  .argument("<repo>", "Target repository path")
  .requiredOption("--title <title>", "Task result title")
  .option("--task <task>", "Original task")
  .option("--source-doc <path>", "Related source document")
  .option("--guard-log <file>", "Guard output log file")
  .option("--guard-command <command>", "Guard command")
  .option("--validation <command...>", "Validation command")
  .option("--result <result>", "Task result status")
  .option("--summary <summary>", "Task result summary")
  .option("--audit", "Run finish-time audit after recording")
  .option("--session <id>", "Task session id for audit")
  .action(
    (
      repo: string,
      options: {
        title: string;
        task?: string;
        sourceDoc?: string;
        guardLog?: string;
        guardCommand?: string;
        validation?: string[];
        result?: string;
        summary?: string;
        audit?: boolean;
        session?: string;
      }
    ) => {
      const recorded = recordTaskResult(repo, {
        title: options.title,
        task: options.task,
        sourceDoc: options.sourceDoc,
        guardLog: options.guardLog,
        guardCommand: options.guardCommand,
        validations: options.validation ?? [],
        result: options.result,
        summary: options.summary
      });
      console.log(
        JSON.stringify(
          {
            ...recorded,
            audit:
              options.audit && options.session
                ? auditTaskResult(repo, {
                    taskSessionId: options.session,
                    validationResults: (options.validation ?? []).map((command) => ({
                      command,
                      result: options.result ?? "passed"
                    }))
                  }).audit
                : undefined
          },
          null,
          2
        )
      );
    }
  );

program
  .command("audit")
  .description("Audit current diff against a task session boundary")
  .argument("<repo>", "Target repository path")
  .requiredOption("--session <id>", "Task session id from prepare_task_context / pnav capsule")
  .option("--validation <entry...>", "Validation result as command=passed or command=failed")
  .action((repo: string, options: { session: string; validation?: string[] }) => {
    console.log(
      JSON.stringify(
        auditTaskResult(repo, {
          taskSessionId: options.session,
          validationResults: (options.validation ?? []).map((entry) => {
            const [command, result = "passed"] = entry.split("=");
            return { command, result };
          })
        }),
        null,
        2
      )
    );
  });

program
  .command("remember")
  .description("Store a project memory")
  .argument("<repo>", "Target repository path")
  .requiredOption("--title <title>", "Task title")
  .requiredOption("--summary <summary>", "Task summary")
  .option("--file <file...>", "Changed file")
  .option("--test <test...>", "Validation command")
  .action((repo: string, options: { title: string; summary: string; file?: string[]; test?: string[] }) => {
    console.log(
      JSON.stringify(
        rememberTask(repo, {
          title: options.title,
          summary: options.summary,
          changedFiles: options.file ?? [],
          tests: options.test ?? []
        }),
        null,
        2
      )
    );
  });

program
  .command("guard")
  .description("Analyze guard output and suggest likely fix files")
  .argument("<repo>", "Target repository path")
  .requiredOption("--log <file>", "Guard output log file")
  .option("--command <command>", "Command that produced the output")
  .option("--source-doc <path>", "Related source document path")
  .action((repo: string, options: { log: string; command?: string; sourceDoc?: string }) => {
    const output = readFileSync(options.log, "utf8");
    console.log(
      JSON.stringify(
        analyzeGuardOutput(repo, output, {
          command: options.command,
          sourceDoc: options.sourceDoc
        }),
        null,
        2
      )
    );
  });

program
  .command("status")
  .description("Print Git dirty worktree status for a repository")
  .argument("<repo>", "Target repository path")
  .action((repo: string) => {
    console.log(JSON.stringify(getWorktreeStatus(repo), null, 2));
  });

program
  .command("mcp")
  .description("Start the MCP server for a repository")
  .argument("<repo>", "Target repository path")
  .action(async (repo: string) => {
    await startMcpServer(repo);
  });

try {
  program.parse();
} catch (error) {
  const message = error instanceof Error ? error.message : `${PACKAGE_NAME} failed`;
  console.error(message);
  process.exitCode = 1;
}
