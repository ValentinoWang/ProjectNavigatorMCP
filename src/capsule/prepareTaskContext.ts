import { loadSourceDoc, type StoredSourceDoc } from "../docs/sourceDocQuery.js";
import { buildWorktreeBoundary, type WorktreeBoundary } from "../git/worktreeBoundary.js";
import { getWorktreeStatus, type WorktreeStatus } from "../git/worktreeStatus.js";
import { analyzeGuardOutput, type GuardOutputAnalysis } from "../guard/analyzeGuardOutput.js";
import { openProject } from "../db/project.js";
import { findRelatedFiles } from "../graph/relatedFiles.js";
import { relatedTests } from "../graph/relatedTests.js";
import { traceRoute } from "../graph/traceRoute.js";
import { findSymbol } from "../graph/symbolSearch.js";
import { searchProjectMemory } from "../memory/memory.js";
import { applyDomainGate } from "../planner/domainGate.js";
import { buildEditBoundaryV2, type EditBoundaryV2 } from "../planner/editBoundaryV2.js";
import { rerankExecutionPlan } from "../planner/executionPlanReranker.js";
import { tierTaskFiles } from "../planner/fileTiering.js";
import { buildMinimalRepairPath } from "../planner/minimalRepairPath.js";
import type { MinimalRepairPath } from "../planner/repairPathTypes.js";
import { inferTaskDomain } from "../planner/taskDomain.js";
import type { DomainDecision, PlannerDebug, RankedExecutionStep } from "../planner/types.js";
import { createTaskSession } from "../tasks/taskSession.js";
import type { CommandHit, FileHit, RouteHit, RuleHit, SymbolHit } from "../graph/types.js";

export interface ReadOrderItem {
  path: string;
  why: string;
  score: number;
  line?: number | null;
  contextTier?: "core" | "inspect" | "reference" | "suppressed";
  editTier?: "must_edit" | "may_edit" | "may_inspect" | "reference_only" | "do_not_touch";
  evidenceTier?: string;
}

export interface ExecutionPlanItem {
  order: number;
  phase: string | null;
  title: string;
  command: string | null;
  targetPath: string | null;
  category: string;
  why: string;
}

export interface EditBoundary {
  preferredFiles: string[];
  doNotTouchWithoutReason: string[];
}

export interface TaskContext {
  task: string;
  taskSessionId: string;
  interpretation: string;
  domain: DomainDecision | null;
  sourceDoc: StoredSourceDoc | null;
  guardFindings: GuardOutputAnalysis["findings"];
  guardRecipes: GuardOutputAnalysis["ruleMatches"];
  readOrder: ReadOrderItem[];
  coreReadOrder: ReadOrderItem[];
  referenceReadOrder: ReadOrderItem[];
  minimalRepairPath: MinimalRepairPath;
  executionPlan: RankedExecutionStep[];
  editBoundary: EditBoundary;
  editBoundaryV2: EditBoundaryV2;
  worktreeBoundary: WorktreeBoundary;
  dirtyWorktree: WorktreeStatus | null;
  likelyFiles: FileHit[];
  relatedFiles: FileHit[];
  symbols: SymbolHit[];
  routes: RouteHit[];
  recommendedCommands: CommandHit[];
  testFiles: string[];
  relatedTests: {
    commands: CommandHit[];
    testFiles: string[];
  };
  projectRules: RuleHit[];
  memoryHits: ReturnType<typeof searchProjectMemory>;
  debug: PlannerDebug | null;
  warnings: string[];
  nextSteps: string[];
}

export interface TaskContextOptions {
  sourceDoc?: string;
  guardOutput?: string;
  guardCommand?: string;
  changedFiles?: string[];
  maxFiles?: number;
  maxSymbols?: number;
  includeMemory?: boolean;
  includeRules?: boolean;
  includeDirtyStatus?: boolean;
  domainHint?: string;
  planMaxSteps?: number;
  includeDebug?: boolean;
}

export function prepareTaskContext(repoPath: string, task: string, options: TaskContextOptions = {}): TaskContext {
  const warnings: string[] = [];
  const sourceDocResult = options.sourceDoc ? loadSourceDoc(repoPath, options.sourceDoc) : { doc: null };
  if (sourceDocResult.warning) {
    warnings.push(sourceDocResult.warning);
  }
  const sourceDoc = sourceDocResult.doc;
  const guardAnalysis = options.guardOutput
    ? analyzeGuardOutput(repoPath, options.guardOutput, { command: options.guardCommand, sourceDoc: options.sourceDoc })
    : null;
  warnings.push(...(guardAnalysis?.warnings ?? []));

  const related = findRelatedFiles(repoPath, task, Math.max(options.maxFiles ?? 20, 40)).files;
  const rawReadOrder = buildReadOrder({
    sourceDoc,
    guardAnalysis,
    changedFiles: options.changedFiles ?? [],
    relatedFiles: related,
    sourceDocPath: options.sourceDoc
  });
  const domain = inferTaskDomain({
    repoPath,
    task,
    domainHint: options.domainHint,
    sourceDoc,
    guardAnalysis,
    changedFiles: options.changedFiles ?? []
  });
  const explicitPaths = explicitTaskPaths(sourceDoc, guardAnalysis, options.changedFiles ?? []);
  const gated = applyDomainGate({ repoPath, domain, readOrder: rawReadOrder, explicitPaths });
  const readOrder = gated.readOrder.slice(0, options.maxFiles ?? 20);
  const fileTiers = tierTaskFiles({
    repoPath,
    sourceDoc,
    guardAnalysis,
    changedFiles: options.changedFiles ?? [],
    domain
  });
  const editBoundaryV2 = buildEditBoundaryV2(fileTiers);
  const tieredReadOrder = annotateReadOrder(readOrder, fileTiers);
  const coreReadOrder = tieredReadOrder.filter((item) => item.contextTier === "core" || item.contextTier === "inspect");
  const referenceReadOrder = tieredReadOrder.filter((item) => item.contextTier === "reference");

  const preferredFiles = [...editBoundaryV2.mustEditFiles, ...editBoundaryV2.mayEditFiles];
  const tests = relatedTests(
    repoPath,
    preferredFiles.length > 0 ? preferredFiles : readOrder.map((item) => item.path),
    task
  );
  const dirtyWorktree = options.includeDirtyStatus === false ? null : getWorktreeStatus(repoPath);
  if (dirtyWorktree?.warnings) {
    warnings.push(...dirtyWorktree.warnings);
  }
  const worktreeBoundary = buildWorktreeBoundary({
    dirtyWorktree,
    preferredFiles,
    changedFiles: options.changedFiles ?? []
  });
  warnings.push(...worktreeBoundary.warnings);

  const likelyFiles = toLikelyFiles(readOrder, related).slice(0, options.maxFiles ?? 20);
  const projectRules = options.includeRules === false ? [] : selectProjectRules(repoPath, task);
  const memoryHits = options.includeMemory === false ? [] : searchProjectMemory(repoPath, task, 5);
  const rawExecutionPlan = buildExecutionPlan(sourceDoc, guardAnalysis, tests.commands);
  const rankedPlan = rerankExecutionPlan({
    repoPath,
    plan: rawExecutionPlan,
    guardAnalysis,
    domain,
    recommendedCommands: tests.commands,
    maxSteps: options.planMaxSteps ?? 8
  });
  const minimalRepairPath = buildMinimalRepairPath({ guardAnalysis, editBoundaryV2 });
  warnings.push(...minimalRepairPath.warnings);
  const taskSession = createTaskSession(repoPath, {
    task,
    sourceDoc: options.sourceDoc,
    domain: domain?.name,
    editBoundaryV2,
    minimalRepairPath
  });

  return {
    task,
    taskSessionId: taskSession.taskSessionId,
    interpretation: interpretTask(task, sourceDoc),
    domain,
    sourceDoc,
    guardFindings: guardAnalysis?.findings ?? [],
    guardRecipes: guardAnalysis?.ruleMatches ?? [],
    readOrder: tieredReadOrder,
    coreReadOrder,
    referenceReadOrder,
    minimalRepairPath,
    executionPlan: rankedPlan.plan,
    editBoundary: {
      preferredFiles: Array.from(new Set(preferredFiles)),
      doNotTouchWithoutReason: dirtyWorktree
        ? dirtyWorktree.modified
            .concat(dirtyWorktree.untracked)
            .filter((file) => !preferredFiles.includes(file))
            .slice(0, 40)
        : []
    },
    editBoundaryV2,
    worktreeBoundary,
    dirtyWorktree,
    likelyFiles,
    relatedFiles: likelyFiles,
    symbols: findSymbol(repoPath, task, options.maxSymbols ?? 12),
    routes: traceRoute(repoPath, task, 12),
    recommendedCommands: tests.commands,
    testFiles: tests.testFiles,
    relatedTests: tests,
    projectRules,
    memoryHits,
    debug:
      options.includeDebug === false
        ? null
        : {
            domainDecision: domain,
            demotedFiles: gated.debug.demotedFiles,
            droppedCommands: rankedPlan.debug.droppedCommands,
            dedupedPlanItems: rankedPlan.debug.dedupedPlanItems,
            suppressedCandidates: tieredReadOrder
              .filter((item) => item.contextTier === "suppressed")
              .map((item) => ({ path: item.path, reason: item.why }))
          },
    warnings: Array.from(new Set(warnings)),
    nextSteps: nextSteps(dirtyWorktree)
  };
}

function explicitTaskPaths(
  sourceDoc: StoredSourceDoc | null,
  guardAnalysis: GuardOutputAnalysis | null,
  changedFiles: string[]
): string[] {
  return [
    ...changedFiles,
    ...(sourceDoc?.targets.map((target) => target.targetPath) ?? []),
    ...(guardAnalysis?.findings.map((finding) => finding.file) ?? []),
    ...(guardAnalysis?.ruleMatches.flatMap((match) => match.canonicalPaths) ?? [])
  ].map(normalizePath);
}

function buildReadOrder(input: {
  sourceDoc: StoredSourceDoc | null;
  guardAnalysis: GuardOutputAnalysis | null;
  changedFiles: string[];
  relatedFiles: FileHit[];
  sourceDocPath?: string;
}): ReadOrderItem[] {
  const items: ReadOrderItem[] = [];
  for (const finding of input.guardAnalysis?.findings ?? []) {
    items.push({ path: finding.file, line: finding.line, why: "Guard failure location", score: 1 });
  }
  for (const file of input.changedFiles) {
    items.push({ path: normalizePath(file), why: "Explicit changed_files input", score: 0.9 });
  }
  for (const target of input.sourceDoc?.targets ?? []) {
    const baseScore = target.kind === "sync_target" ? 0.95 : target.kind === "validation_target" ? 0.85 : 0.75;
    const score = Math.min(baseScore, target.confidence);
    items.push({
      path: target.targetPath,
      why: `Explicit source_doc ${target.kind}`,
      score
    });
  }
  for (const file of input.relatedFiles) {
    const score = markdownPenalty(file.path, input.sourceDocPath)
      ? Math.min(file.score, 0.1)
      : Math.min(file.score, 0.6);
    items.push({ path: file.path, why: file.reason, score });
  }
  return dedupeReadOrder(items).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function annotateReadOrder(readOrder: ReadOrderItem[], fileTiers: ReturnType<typeof tierTaskFiles>): ReadOrderItem[] {
  const tiers = new Map(fileTiers.map((item) => [item.path, item]));
  return readOrder.map((item) => {
    const tier = tiers.get(normalizePath(item.path));
    const editTier = tier?.tier ?? (item.score < 0.3 ? "reference_only" : "may_inspect");
    return {
      ...item,
      editTier,
      evidenceTier: tier?.evidence[0] ?? evidenceTierFromWhy(item.why),
      contextTier: contextTierFor(editTier, item.score)
    };
  });
}

function contextTierFor(editTier: ReadOrderItem["editTier"], score: number): ReadOrderItem["contextTier"] {
  if (editTier === "must_edit" || editTier === "may_edit") {
    return "core";
  }
  if (editTier === "may_inspect" && score >= 0.55) {
    return "inspect";
  }
  if (editTier === "do_not_touch" || score < 0.2) {
    return "suppressed";
  }
  return "reference";
}

function evidenceTierFromWhy(why: string): string {
  if (why.includes("Guard failure")) {
    return "direct_guard";
  }
  if (why.includes("sync_target")) {
    return "frontmatter_sync";
  }
  if (why.includes("depends_on")) {
    return "frontmatter_depends";
  }
  if (why.includes("validation")) {
    return "frontmatter_validation";
  }
  return "fallback_keyword";
}

function buildExecutionPlan(
  sourceDoc: StoredSourceDoc | null,
  guardAnalysis: GuardOutputAnalysis | null,
  recommendedCommands: CommandHit[]
): ExecutionPlanItem[] {
  const items: ExecutionPlanItem[] = [];
  for (const finding of guardAnalysis?.findings ?? []) {
    items.push({
      order: items.length + 1,
      phase: "guard output",
      title: `Fix ${finding.file}${finding.line ? `:${finding.line}` : ""}`,
      command: guardAnalysis?.command ?? null,
      targetPath: finding.file,
      category: "guard",
      why: "Direct guard failure should be resolved before broad exploration."
    });
  }
  for (const match of guardAnalysis?.ruleMatches ?? []) {
    for (const canonicalPath of match.canonicalPaths) {
      items.push({
        order: items.length + 1,
        phase: "inspect",
        title: `Inspect canonical path for ${match.ruleId}`,
        command: null,
        targetPath: canonicalPath,
        category: "guard_recipe",
        why: `Guard recipe canonical path for ${match.ruleId}.`
      });
    }
    for (const command of match.validationCommands) {
      items.push({
        order: items.length + 1,
        phase: "guard recipe validation",
        title: command,
        command,
        targetPath: null,
        category: "guard",
        why: `Guard recipe validation for ${match.ruleId}.`
      });
    }
  }
  for (const target of sourceDoc?.targets.filter(
    (item) => item.kind === "sync_target" && isExecutablePath(item.targetPath)
  ) ?? []) {
    items.push({
      order: items.length + 1,
      phase: "source_doc sync_target",
      title: `Review and run ${target.targetPath}`,
      command: commandForExecutableTarget(target.targetPath),
      targetPath: target.targetPath,
      category: "guard",
      why: "Explicit executable source_doc sync_target."
    });
  }
  for (const step of selectSourceDocSteps(sourceDoc)) {
    items.push({
      order: items.length + 1,
      phase: step.phase,
      title: step.title ?? step.command ?? step.rawText,
      command: step.command,
      targetPath: step.targetPath,
      category: step.category,
      why: sourceDoc ? `source_doc ${step.phase ?? "execution"} signal` : "source document step"
    });
  }
  for (const command of recommendedCommands.slice(0, 5)) {
    items.push({
      order: items.length + 1,
      phase: "recommended validation",
      title: command.name,
      command: command.command,
      targetPath: null,
      category: command.category,
      why: command.reason ?? "Recommended by related test analysis."
    });
  }
  return dedupePlan(items).map((item, index) => ({ ...item, order: index + 1 }));
}

function isExecutablePath(targetPath: string): boolean {
  return /\.(py|sh|bash|js|ts)$/.test(targetPath) && /(^|\/)(scripts|tools|bin)\//.test(targetPath);
}

function commandForExecutableTarget(targetPath: string): string {
  if (targetPath.endsWith(".py")) {
    return `python ${targetPath}`;
  }
  if (targetPath.endsWith(".sh") || targetPath.endsWith(".bash")) {
    return `bash ${targetPath}`;
  }
  return `node ${targetPath}`;
}

function selectSourceDocSteps(sourceDoc: StoredSourceDoc | null): StoredSourceDoc["steps"] {
  if (!sourceDoc) {
    return [];
  }
  const selected: StoredSourceDoc["steps"] = [];
  const perPhase = new Map<string, number>();
  const commandSteps = sourceDoc.steps
    .filter((step) => step.command)
    .map((step) => ({ step, score: scoreDocCommand(step) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.step.ordinal - b.step.ordinal)
    .slice(0, 8)
    .map((item) => item.step);
  selected.push(...commandSteps);

  for (const step of sourceDoc.steps) {
    if (step.command) {
      continue;
    }
    const phase = step.phase ?? "source_doc";
    const phaseCount = perPhase.get(phase) ?? 0;
    if (phaseCount >= 2) {
      continue;
    }
    if (!isActionableDocStep(step)) {
      continue;
    }
    selected.push(step);
    perPhase.set(phase, phaseCount + 1);
    if (selected.length >= 18) {
      break;
    }
  }

  return dedupeSourceDocSteps(selected).slice(0, 24);
}

function isActionableDocStep(step: StoredSourceDoc["steps"][number]): boolean {
  const text = `${step.title ?? ""} ${step.rawText}`.toLowerCase();
  if (step.targetPath) {
    return true;
  }
  return /guard|test|验收|校验|检查|运行|run|check|禁止|不得|must|必须/.test(text);
}

function scoreDocCommand(step: StoredSourceDoc["steps"][number]): number {
  const command = step.command?.toLowerCase() ?? "";
  const phase = step.phase?.toLowerCase() ?? "";
  if (phase.includes("frontmatter validation")) {
    return 1;
  }
  if (/role[_-]visual|design[_-]system|design-token|magic-number|quality\/test_role_visual/.test(command)) {
    return 0.95;
  }
  if (/guard|lint|check|analyze/.test(command)) {
    return 0.75;
  }
  if (/test|pytest|flutter test|vitest/.test(command)) {
    return 0.7;
  }
  return 0;
}

function dedupeSourceDocSteps(steps: StoredSourceDoc["steps"]): StoredSourceDoc["steps"] {
  const seen = new Set<string>();
  return steps.filter((step) => {
    const key = `${step.command ?? ""}:${step.targetPath ?? ""}:${step.rawText}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toLikelyFiles(readOrder: ReadOrderItem[], relatedFiles: FileHit[]): FileHit[] {
  const relatedByPath = new Map(relatedFiles.map((file) => [file.path, file]));
  return readOrder.map((item) => {
    const related = relatedByPath.get(item.path);
    return {
      path: item.path,
      language: related?.language,
      score: item.score,
      reason: item.why
    };
  });
}

function interpretTask(task: string, sourceDoc: StoredSourceDoc | null): string {
  if (sourceDoc) {
    return `Source-document-driven task (${sourceDoc.ownerDomain ?? "unknown domain"}${sourceDoc.authority ? `, ${sourceDoc.authority}` : ""}). Prefer frontmatter, guard output, and validation commands over generic keyword matches.`;
  }
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
      .prepare(
        "SELECT source_file AS sourceFile, title, body, category FROM project_rules WHERE repo_id = ? ORDER BY id LIMIT 300"
      )
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
  if (
    /frontend|flutter|ui|layout|responsive|滚动|scroll/.test(loweredTask) &&
    /frontend|flutter|ui|layout|responsive|width|sliver|scroll|magic number/.test(loweredRule)
  ) {
    score += 0.45;
  }
  if (
    /backend|api|schema|openapi|sdk|接口|字段|contract/.test(loweredTask) &&
    /backend|api|schema|openapi|sdk|contract|generated|migration/.test(loweredRule)
  ) {
    score += 0.45;
  }
  if (
    /auth|identity|登录|身份/.test(loweredTask) &&
    /auth|identity|role|session|user|permission|frontend-auth/.test(loweredRule)
  ) {
    score += 0.45;
  }
  if (/do not|never|不要|禁止|must|必须/.test(loweredRule)) {
    score += 0.2;
  }
  return Math.min(1, score);
}

function nextSteps(dirtyWorktree: WorktreeStatus | null): string[] {
  const steps = [
    "Open guard findings and source_doc sync_targets before generic search results.",
    "Use the execution_plan commands to reproduce and validate the task.",
    "After the change, run the narrow guard/test first, then broader validation.",
    "Use remember_task after completion to store root cause, changed files, and validation commands."
  ];
  if (dirtyWorktree?.dirty) {
    steps.unshift("Worktree is dirty: edit only the preferred files unless there is a clear reason to expand scope.");
  }
  return steps;
}

function markdownPenalty(filePath: string, sourceDocPath?: string): boolean {
  if (sourceDocPath && normalizePath(filePath) === normalizePath(sourceDocPath)) {
    return false;
  }
  return /\.(md|markdown)$/i.test(filePath) || filePath.startsWith("agents-results/");
}

function dedupeReadOrder(items: ReadOrderItem[]): ReadOrderItem[] {
  const best = new Map<string, ReadOrderItem>();
  for (const item of items) {
    const normalized = normalizePath(item.path);
    const existing = best.get(normalized);
    if (!existing || item.score > existing.score) {
      best.set(normalized, { ...item, path: normalized });
    }
  }
  return Array.from(best.values());
}

function dedupePlan(items: ExecutionPlanItem[]): ExecutionPlanItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.command ?? ""}:${item.targetPath ?? ""}:${item.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizePath(filePath: string): string {
  return filePath.replace(/^\.\/+/, "").replaceAll("\\", "/");
}
