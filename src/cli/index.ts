#!/usr/bin/env node
import { Command } from "commander";
import { prepareTaskContext } from "../capsule/prepareTaskContext.js";
import { renderCapsule } from "../capsule/renderCapsule.js";
import { getRepoMap, renderRepoMap } from "../graph/repoMap.js";
import { startMcpServer } from "../mcp/server.js";
import { rememberTask, searchProjectMemory } from "../memory/memory.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { getDoctorReport, renderDoctorReport } from "./commands/doctor.js";
import { initProject, renderInitResult } from "./commands/init.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../shared/packageInfo.js";

const program = new Command();

program
  .name("pnav")
  .description("Local Repository Intelligence MCP CLI")
  .version(PACKAGE_VERSION);

program.command("doctor").description("Check local ProjectNavigatorMCP prerequisites").action(() => {
  console.log(renderDoctorReport(getDoctorReport()));
});

program.command("init").description("Initialize ProjectNavigatorMCP metadata in a repository").argument("<repo>", "Target repository path").action((repo: string) => {
  console.log(renderInitResult(initProject(repo)));
});

program.command("scan").description("Scan a repository into its local .pnav index").argument("<repo>", "Target repository path").action((repo: string) => {
  const result = scanRepo(repo);
  console.log(JSON.stringify(result, null, 2));
});

program.command("map").description("Print a compact repository map").argument("<repo>", "Target repository path").action((repo: string) => {
  console.log(renderRepoMap(getRepoMap(repo)));
});

program.command("capsule").description("Prepare a task context capsule").argument("<repo>", "Target repository path").argument("<task>", "Task description").action((repo: string, task: string) => {
  console.log(renderCapsule(prepareTaskContext(repo, task)));
});

program.command("memory").description("Search project memory").argument("<repo>", "Target repository path").argument("<query>", "Memory search query").option("-l, --limit <number>", "Maximum memories", "10").action((repo: string, query: string, options: { limit: string }) => {
  console.log(JSON.stringify({ memories: searchProjectMemory(repo, query, Number(options.limit)) }, null, 2));
});

program.command("remember").description("Store a project memory").argument("<repo>", "Target repository path").requiredOption("--title <title>", "Task title").requiredOption("--summary <summary>", "Task summary").option("--file <file...>", "Changed file").option("--test <test...>", "Validation command").action((repo: string, options: { title: string; summary: string; file?: string[]; test?: string[] }) => {
  console.log(JSON.stringify(rememberTask(repo, {
    title: options.title,
    summary: options.summary,
    changedFiles: options.file ?? [],
    tests: options.test ?? []
  }), null, 2));
});

program.command("mcp").description("Start the MCP server for a repository").argument("<repo>", "Target repository path").action(async (repo: string) => {
  await startMcpServer(repo);
});

try {
  program.parse();
} catch (error) {
  const message = error instanceof Error ? error.message : `${PACKAGE_NAME} failed`;
  console.error(message);
  process.exitCode = 1;
}
