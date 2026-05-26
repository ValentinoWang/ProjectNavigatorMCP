import { findRelatedFiles } from "../graph/relatedFiles.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { traceRoute } from "../graph/traceRoute.js";
import { relatedTests } from "../graph/relatedTests.js";
import { searchProjectMemory } from "../memory/memory.js";
import { openProject } from "../db/project.js";
import type { CommandHit, FileHit, RouteHit, RuleHit, SymbolHit } from "../graph/types.js";

export interface TaskContext {
  task: string;
  interpretation: string;
  likelyFiles: FileHit[];
  symbols: SymbolHit[];
  routes: RouteHit[];
  recommendedCommands: CommandHit[];
  testFiles: string[];
  projectRules: RuleHit[];
  memoryHits: ReturnType<typeof searchProjectMemory>;
  nextSteps: string[];
}

export function prepareTaskContext(repoPath: string, task: string): TaskContext {
  const likelyFiles = findRelatedFiles(repoPath, task, 20).files;
  const symbols = findSymbol(repoPath, task, 12);
  const routes = traceRoute(repoPath, task, 12);
  const tests = relatedTests(repoPath, likelyFiles.map((file) => file.path), task);
  const projectRules = selectProjectRules(repoPath, task);
  const memoryHits = searchProjectMemory(repoPath, task, 5);

  return {
    task,
    interpretation: interpretTask(task),
    likelyFiles,
    symbols,
    routes,
    recommendedCommands: tests.commands,
    testFiles: tests.testFiles,
    projectRules,
    memoryHits,
    nextSteps: [
      "Open the highest-scoring files first and confirm the real entry point before editing.",
      "Check matching tests and project rules before changing behavior.",
      "After the change, run the recommended commands that match the touched area.",
      "Use remember_task after completion to store root cause, changed files, and validation commands."
    ]
  };
}

function interpretTask(task: string): string {
  if (/登录|auth|identity|身份/.test(task.toLowerCase())) {
    return "Auth/identity workflow task. Pay attention to role-specific and session bootstrap paths.";
  }
  if (/workspace|microplan|滚动|scroll|sliver/.test(task.toLowerCase())) {
    return "Flutter workspace UI task. Pay attention to route entry, layout constraints, and responsive guard tests.";
  }
  if (/session plan|session_plan|接口|api|字段|contract|openapi/.test(task.toLowerCase())) {
    return "API contract task. Pay attention to backend schema, OpenAPI artifacts, generated SDK, and drift guards.";
  }
  return "General repository task. Use likely files, symbols, routes, tests, and project rules to narrow context.";
}

function selectProjectRules(repoPath: string, task: string): RuleHit[] {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare("SELECT source_file AS sourceFile, title, body, category FROM project_rules WHERE repo_id = ? ORDER BY id LIMIT 300")
      .all(project.repo.id) as RuleHit[];
    return rows
      .map((row) => ({
        ...row,
        score: scoreRule(task, row)
      }))
      .filter((row) => (row.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10);
  } finally {
    project.db.close();
  }
}

function scoreRule(task: string, rule: RuleHit): number {
  const loweredTask = task.toLowerCase();
  const loweredRule = `${rule.body} ${rule.category} ${rule.title ?? ""}`.toLowerCase();
  let score = 0;
  if (/test|测试|guard|验收/.test(loweredRule)) {
    score += 0.25;
  }
  if (/frontend|flutter|ui|layout|responsive|滚动|scroll/.test(loweredTask) && /frontend|flutter|ui|layout|responsive|width|sliver|scroll|magic number/.test(loweredRule)) {
    score += 0.45;
  }
  if (/backend|api|schema|openapi|sdk|接口|字段|contract/.test(loweredTask) && /backend|api|schema|openapi|sdk|contract|generated|migration/.test(loweredRule)) {
    score += 0.45;
  }
  if (/auth|identity|登录|身份/.test(loweredTask) && /auth|identity|role|session|user|permission|frontend-auth/.test(loweredRule)) {
    score += 0.45;
  }
  if (/do not|never|不要|禁止|must|必须/.test(loweredRule)) {
    score += 0.2;
  }
  return Math.min(1, score);
}
