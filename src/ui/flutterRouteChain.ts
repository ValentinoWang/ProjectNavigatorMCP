import { readFileSync } from "node:fs";
import path from "node:path";
import { openProject } from "../db/project.js";
import { relatedTests } from "../graph/relatedTests.js";
import { scoreText } from "../graph/scoring.js";
import type { EvidenceItem } from "../discovery/types.js";

export interface RouteToWidgetStep {
  kind: "route" | "page" | "widget" | "section_or_card";
  symbol: string | null;
  path: string;
  confidence: number;
  evidence: EvidenceItem[];
}

export interface RouteToWidgetChain {
  status: "verified_chain" | "partial_chain" | "candidate_chain";
  steps: RouteToWidgetStep[];
  depth: number;
  completeness: ChainCompleteness;
  confidence: number;
  warnings: string[];
  testCoverage?: RouteToWidgetTestCoverage;
}

export type ChainCompleteness = "route_page_only" | "route_main_widget" | "route_section_card" | "route_test_covered";

export interface RouteToWidgetTestCoverage {
  covered: boolean;
  coverageStrength: "strong" | "weak";
  weakCovered?: boolean;
  testFiles: string[];
  evidence: EvidenceItem[];
}

interface SymbolRow {
  id: number;
  name: string;
  qualifiedName: string | null;
  kind: string;
  path: string;
  startLine: number;
  endLine: number;
}

export function findFlutterRouteToWidgetChain(repoPath: string, task: string): RouteToWidgetChain {
  const project = openProject(repoPath);
  try {
    const symbols = project.db
      .prepare(
        `SELECT s.id, s.name, s.qualified_name AS qualifiedName, s.kind, f.path, s.start_line AS startLine, s.end_line AS endLine
         FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ? AND f.path LIKE 'frontend/%'`
      )
      .all(project.repo.id) as SymbolRow[];
    const byName = new Map<string, SymbolRow[]>();
    for (const symbol of symbols) {
      const names = [symbol.name, symbol.qualifiedName].filter(Boolean).map(String);
      for (const name of names) {
        const key = name.split(".").at(-1) ?? name;
        byName.set(key, [...(byName.get(key) ?? []), symbol]);
      }
    }
    const routes = project.db
      .prepare(
        `SELECT r.path AS routePath, r.name, f.path AS filePath
         FROM routes r JOIN files f ON f.id = r.file_id
         WHERE r.repo_id = ? AND r.framework = 'flutter_go_router'`
      )
      .all(project.repo.id) as Array<{ routePath: string; name: string | null; filePath: string }>;
    const route = routes
      .filter((item) => !isTestPath(item.filePath))
      .map((item) => ({
        ...item,
        score: routeScore(task, item)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))[0];
    const steps: RouteToWidgetStep[] = [];
    if (route) {
      steps.push({
        kind: "route",
        symbol: route.name,
        path: route.filePath,
        confidence: 0.86,
        evidence: [{ type: "route_match", detail: `${route.name ?? ""} ${route.routePath}`.trim(), score: route.score }]
      });
      const routeContent = routeBlockFor(safeRead(repoPath, route.filePath), route);
      const pageName = extractConstructedWidgets(routeContent).find((name) => isPageLikeName(name));
      const page = pageName ? bestSymbol(byName.get(pageName) ?? [], task, "page") : null;
      if (page) {
        steps.push(stepForSymbol("page", page, "route_builds_page", 0.92));
        appendCompositionSteps(repoPath, task, page, byName, steps, 3);
      }
    }
    if (steps.length < 2) {
      const page = bestSymbol(
        symbols.filter((symbol) => isPageLikeSymbol(symbol)),
        task,
        "page"
      );
      if (page) {
        steps.push(stepForSymbol("page", page, "page_candidate", 0.74));
        appendCompositionSteps(repoPath, task, page, byName, steps, 3);
      }
    }
    const testCoverage = findChainTestCoverage(
      repoPath,
      task,
      steps.map((step) => step.path)
    );
    const completeness = classifyCompleteness(
      steps,
      testCoverage.covered && testCoverage.coverageStrength === "strong"
    );
    const confidence = Number(
      Math.min(0.98, steps.reduce((total, step) => total + step.confidence, 0) / Math.max(1, steps.length)).toFixed(2)
    );
    return {
      status:
        steps.some((step) => step.kind === "route") && steps.length >= 3
          ? "verified_chain"
          : steps.length >= 2
            ? "partial_chain"
            : "candidate_chain",
      steps,
      depth: steps.length,
      completeness,
      confidence,
      warnings: steps.length === 0 ? ["No Flutter route-to-widget chain found."] : [],
      testCoverage
    };
  } finally {
    project.db.close();
  }
}

export function classifyCompleteness(steps: RouteToWidgetStep[], testCovered = false): ChainCompleteness {
  if (testCovered && steps.some((step) => step.kind === "widget" || step.kind === "section_or_card")) {
    return "route_test_covered";
  }
  if (steps.some((step) => step.kind === "section_or_card")) {
    return "route_section_card";
  }
  if (steps.some((step) => step.kind === "widget")) {
    return "route_main_widget";
  }
  return "route_page_only";
}

function findChainTestCoverage(repoPath: string, task: string, chainPaths: string[]): RouteToWidgetTestCoverage {
  if (chainPaths.length === 0) {
    return { covered: false, coverageStrength: "weak", testFiles: [], evidence: [] };
  }
  const strong = directChainTests(repoPath, chainPaths);
  if (strong.testFiles.length > 0) {
    return {
      covered: true,
      coverageStrength: "strong",
      testFiles: strong.testFiles.slice(0, 10),
      evidence: strong.testFiles.slice(0, 10).map((file) => ({
        type: "direct_test_edge",
        detail: file,
        score: 0.9
      }))
    };
  }
  const weakTestFiles = relatedTests(repoPath, chainPaths, task).testFiles.slice(0, 10);
  return {
    covered: false,
    coverageStrength: "weak",
    weakCovered: weakTestFiles.length > 0,
    testFiles: weakTestFiles,
    evidence: weakTestFiles.map((file) => ({
      type: "related_search_test",
      detail: file,
      score: 0.45
    }))
  };
}

function directChainTests(repoPath: string, chainPaths: string[]): { testFiles: string[] } {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT DISTINCT tf.path AS testPath
         FROM tests t
         JOIN files sf ON sf.id = t.target_file_id
         JOIN files tf ON tf.id = t.test_file_id
         WHERE t.repo_id = ? AND sf.path IN (${chainPaths.map(() => "?").join(", ")})
         ORDER BY tf.path`
      )
      .all(project.repo.id, ...chainPaths) as Array<{ testPath: string }>;
    return { testFiles: rows.map((row) => row.testPath) };
  } finally {
    project.db.close();
  }
}

function appendCompositionSteps(
  repoPath: string,
  task: string,
  source: SymbolRow,
  byName: Map<string, SymbolRow[]>,
  steps: RouteToWidgetStep[],
  maxDepth: number
): void {
  let current = source;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next =
      nextComposedSymbol(symbolContent(repoPath, current), current, task, byName, steps) ??
      nextComposedSymbol(safeRead(repoPath, current.path), current, task, byName, steps);
    if (!next) {
      break;
    }
    const kind = /Card|Section|Tile|Panel/.test(next.name) ? "section_or_card" : "widget";
    steps.push(stepForSymbol(kind, next, depth === 0 ? "page_composes_widget" : "widget_composes_widget", 0.84));
    current = next;
  }
}

function nextComposedSymbol(
  content: string,
  current: SymbolRow,
  task: string,
  byName: Map<string, SymbolRow[]>,
  steps: RouteToWidgetStep[]
): SymbolRow | null {
  return (
    extractConstructedWidgets(content)
      .filter((name) => name !== current.name)
      .map((name) => bestSymbol(byName.get(name) ?? [], task, "widget"))
      .filter((value): value is SymbolRow => Boolean(value))
      .filter((symbol) => isCoreWidgetSymbol(symbol, task))
      .filter((symbol) => isBusinessRelevantComposition(symbol, task))
      .filter(
        (symbol) =>
          !steps.some((step) => step.path === symbol.path && step.symbol === (symbol.qualifiedName ?? symbol.name))
      )
      .map((symbol) => ({
        symbol,
        score:
          scoreText(task, `${symbol.name} ${symbol.qualifiedName ?? ""} ${symbol.path}`) +
          pathPreference(task, symbol.path) +
          sameModulePreference(current.path, symbol.path)
      }))
      .sort((a, b) => b.score - a.score || a.symbol.path.localeCompare(b.symbol.path))[0]?.symbol ?? null
  );
}

function isBusinessRelevantComposition(symbol: SymbolRow, task: string): boolean {
  if (isSupportPath(symbol.path)) {
    return false;
  }
  const lowerTask = task.toLowerCase();
  const lowerName = symbol.name.toLowerCase();
  const lowerPath = symbol.path.toLowerCase();
  if (
    /dashboard|athlete|training|trend|card|section|home|view|page|screen|organization|detail|stats|metric|grid|action|bar|panel/.test(
      lowerName
    )
  ) {
    return true;
  }
  const basename = lowerPath.split("/").at(-1) ?? lowerPath;
  const taskTokens = lowerTask.split(/[^a-z0-9_\u4e00-\u9fff]+/u).filter((token) => token.length > 3);
  return taskTokens.some((token) => lowerName.includes(token) || basename.includes(token));
}

function extractConstructedWidgets(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(/\b(?:const\s+|new\s+)?([A-Z][A-Za-z0-9_]*)\s*\(/g)) {
    const name = match[1];
    if (!isNonBusinessWidgetName(name)) {
      names.add(name);
    }
  }
  return Array.from(names);
}

function bestSymbol(symbols: SymbolRow[], task: string, expected: "page" | "widget" = "widget"): SymbolRow | null {
  return (
    symbols
      .filter((symbol) => !isTestPath(symbol.path))
      .filter((symbol) => (expected === "page" ? isPageLikeSymbol(symbol) : isCoreWidgetSymbol(symbol, task)))
      .map((symbol) => ({
        symbol,
        score:
          scoreText(task, `${symbol.name} ${symbol.qualifiedName ?? ""} ${symbol.path}`) +
          pathPreference(task, symbol.path) +
          (expected === "page" && /Page|Screen|View|Home/.test(symbol.name) ? 0.35 : 0)
      }))
      .sort((a, b) => b.score - a.score || a.symbol.path.localeCompare(b.symbol.path))[0]?.symbol ?? null
  );
}

function stepForSymbol(
  kind: RouteToWidgetStep["kind"],
  symbol: SymbolRow,
  evidenceType: string,
  confidence: number
): RouteToWidgetStep {
  return {
    kind,
    symbol: symbol.qualifiedName ?? symbol.name,
    path: symbol.path,
    confidence,
    evidence: [{ type: evidenceType, detail: symbol.qualifiedName ?? symbol.name, score: confidence }]
  };
}

function safeRead(repoPath: string, filePath: string): string {
  try {
    return readFileSync(path.join(repoPath, filePath), "utf8");
  } catch {
    return "";
  }
}

function routeScore(task: string, route: { routePath: string; name: string | null; filePath: string }): number {
  const evidence = `${route.routePath} ${route.name ?? ""} ${route.filePath}`;
  return scoreText(task, evidence) + pathPreference(task, route.filePath) - routeSubdomainPenalty(task, evidence);
}

function routeSubdomainPenalty(task: string, evidence: string): number {
  const lowerTask = task.toLowerCase();
  const lowerEvidence = evidence.toLowerCase();
  const unrelatedHints = [
    "lookup",
    "management",
    "platform",
    "session",
    "plan",
    "profile",
    "settings",
    "admin",
    "pr",
    "list"
  ];
  return unrelatedHints.some((hint) => lowerEvidence.includes(hint) && !lowerTask.includes(hint)) ? 0.5 : 0;
}

function routeBlockFor(content: string, route: { routePath: string; name: string | null }): string {
  const needles = [route.name, route.routePath].filter(Boolean) as string[];
  const index = needles.map((needle) => content.indexOf(needle)).find((value) => value >= 0) ?? -1;
  if (index < 0) {
    return content;
  }
  const start = Math.max(0, content.lastIndexOf("GoRoute(", index));
  const next = content.indexOf("GoRoute(", index + 1);
  const end = next > index ? next : Math.min(content.length, index + 1800);
  return content.slice(start, end);
}

function pathPreference(task: string, filePath: string): number {
  const lowerTask = task.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  let score = 0;
  if (lowerPath.startsWith("frontend/lib/")) {
    score += 0.25;
  }
  if (/router|route/.test(lowerPath)) {
    score += 0.15;
  }
  if (/dashboard/.test(lowerTask) && /dashboard/.test(lowerPath)) {
    score += 0.35;
  }
  if (/athlete|运动员/.test(lowerTask) && /athlete/.test(lowerPath)) {
    score += 0.25;
  }
  if (/training|训练/.test(lowerTask) && /training/.test(lowerPath)) {
    score += 0.15;
  }
  if (lowerPath.includes("/modules/design_system/") && !/design system|设计系统|视觉|token|guard/.test(lowerTask)) {
    score -= 0.8;
  }
  return score;
}

function sameModulePreference(currentPath: string, candidatePath: string): number {
  const currentParts = currentPath.split("/");
  const candidateParts = candidatePath.split("/");
  let shared = 0;
  for (let index = 0; index < Math.min(currentParts.length, candidateParts.length); index += 1) {
    if (currentParts[index] !== candidateParts[index]) {
      break;
    }
    shared += 1;
  }
  return Math.min(0.35, shared * 0.04);
}

function isTestPath(filePath: string): boolean {
  return /(^|\/)(test|tests)\//.test(filePath);
}

function isPageLikeName(name: string): boolean {
  return /Page|Screen|View|Home/.test(name) && !/ViewModel|DesignValues|Provider|Controller|State$/.test(name);
}

function isPageLikeSymbol(symbol: SymbolRow): boolean {
  return isPageLikeName(symbol.name) && !symbol.name.startsWith("_") && !isSupportPath(symbol.path);
}

function isCoreWidgetSymbol(symbol: SymbolRow, task: string): boolean {
  const lowerTask = task.toLowerCase();
  if (symbol.name.startsWith("_") && !isPrivateWidgetOwnerName(symbol.name, lowerTask)) {
    return false;
  }
  if (/ViewModel|DesignValues|Provider|Controller|Notifier|State$/.test(symbol.name)) {
    return false;
  }
  if (/\.g\.dart$/.test(symbol.path) || symbol.path.includes("/packages/api_client/")) {
    return false;
  }
  if (/^DS[A-Z]/.test(symbol.name) && !/design system|设计系统|视觉|token|guard/.test(lowerTask)) {
    return false;
  }
  return !isSupportPath(symbol.path);
}

function isPrivateWidgetOwnerName(name: string, loweredTask: string): boolean {
  if (/dashboard|card|section|home|view|widget|grid|stats|metric|action|bar|panel|detail|organization/i.test(name)) {
    return true;
  }
  const loweredName = name.toLowerCase();
  return loweredTask
    .split(/[^a-z0-9_\u4e00-\u9fff]+/u)
    .filter((token) => token.length > 3)
    .some((token) => loweredName.includes(token));
}

function isSupportPath(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  return (
    lowerPath.includes("/core/qa/") ||
    lowerPath.includes("/core/widgets/adaptive_grid.dart") ||
    lowerPath.includes("/packages/api_client/") ||
    lowerPath.endsWith(".g.dart") ||
    lowerPath.includes("/modules/design_system/components/") ||
    lowerPath.includes("/modules/design_system/foundation/") ||
    /(l10n|locale|api_error|logger|logging|auth_user_cache|theme|tokens|utils?|helpers?|constants)/.test(lowerPath)
  );
}

function isNonBusinessWidgetName(name: string): boolean {
  const primitive = new Set([
    "String",
    "Text",
    "Column",
    "Row",
    "Container",
    "Padding",
    "SizedBox",
    "Scaffold",
    "Card",
    "Center",
    "Expanded",
    "Flexible",
    "Stack",
    "Positioned",
    "ListView",
    "GridView",
    "SingleChildScrollView",
    "Builder",
    "GestureDetector",
    "InkWell",
    "Icon",
    "Divider",
    "Spacer",
    "SafeArea",
    "Material",
    "Theme",
    "MediaQuery",
    "LayoutBuilder"
  ]);
  return (
    primitive.has(name) ||
    /^DS[A-Z]/.test(name) ||
    /ViewModel|DesignValues|Provider|Controller|Notifier|Duration|DateTime|Future|Stream|Iterable|List|Map|Set|Function/.test(
      name
    )
  );
}

function symbolContent(repoPath: string, symbol: SymbolRow): string {
  const content = safeRead(repoPath, symbol.path);
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, symbol.startLine - 1);
  if (symbol.endLine > symbol.startLine + 20) {
    return lines.slice(start, Math.min(lines.length, symbol.endLine + 1)).join("\n");
  }
  const nextClassOffset = lines
    .slice(start + 1)
    .findIndex((line) => /^\s*(?:class|mixin|extension|enum)\s+[A-Za-z_]/.test(line));
  const end = nextClassOffset >= 0 ? start + 1 + nextClassOffset : Math.min(lines.length, start + 260);
  return lines.slice(start, end).join("\n");
}
