import type { FileHit } from "../graph/types.js";
import { scoreText } from "../graph/scoring.js";
import type { EntrypointHit, SimilarCodeHit } from "./types.js";

export interface DiscoveryIntentProfile {
  frontendUi: boolean;
  api: boolean;
  flutter: boolean;
  dashboard: boolean;
  athlete: boolean;
  test: boolean;
  e2e: boolean;
  tokens: string[];
}

export interface EntrypointCandidateInput {
  type: string;
  path: string;
  symbol: string | null;
  routePath?: string | null;
  method?: string | null;
  rawText: string;
}

export interface ReadOrderTiers {
  mustRead: FileHit[];
  shouldInspect: FileHit[];
  ignoreForNow: FileHit[];
}

export function buildDiscoveryIntentProfile(task: string): DiscoveryIntentProfile {
  const lowered = task.toLowerCase();
  const tokens = lowered
    .split(/[^a-z0-9_\u4e00-\u9fff]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  return {
    frontendUi: /页面|界面|组件|卡片|widget|flutter|frontend|dashboard|card|ui|视觉/.test(lowered),
    api: /api|接口|endpoint|schema|字段|backend|fastapi|route handler|数据库/.test(lowered),
    flutter: /flutter|dart|widget|卡片|页面|dashboard|frontend/.test(lowered),
    dashboard: /\bdashboard\b|仪表盘|看板/.test(lowered),
    athlete: /\bathlete\b|运动员/.test(lowered),
    test: /\btest\b|测试|spec/.test(lowered),
    e2e: /e2e|maestro|patrol|截图|screenshot/.test(lowered),
    tokens
  };
}

export function scoreEntrypointCandidate(task: string, candidate: EntrypointCandidateInput): EntrypointHit {
  const profile = buildDiscoveryIntentProfile(task);
  const normalizedPath = candidate.path.toLowerCase();
  const normalizedSymbol = (candidate.symbol ?? "").toLowerCase();
  const queryMatch = scoreText(task, candidate.rawText);
  const typeWeight = entrypointTypeWeight(candidate.type, candidate.symbol ?? "", candidate.path);
  const moduleScore = moduleProximity(profile, normalizedPath);
  const symbolScore = symbolExactness(profile, normalizedSymbol);
  const domainPenalty = discoveryNoisePenalty(profile, candidate.path);
  const subdomainPenalty = irrelevantSubdomainPenalty(profile, candidate.path, candidate.symbol ?? "");
  const testPenalty = !profile.test && /(^|\/)(test|tests)\//.test(candidate.path) ? 0.28 : 0;
  const routeBonus = candidate.type.includes("route") ? 0.12 : 0;
  const privatePenalty = /^_/.test(candidate.symbol ?? "") ? 0.12 : 0;
  const genericPenalty =
    /\b_card\b|(^|[A-Z])Card$|_card/i.test(candidate.symbol ?? "") && !/page|screen|view/i.test(candidate.symbol ?? "")
      ? 0.06
      : 0;
  const finalScore = clampScore(
    queryMatch * 0.28 +
      typeWeight * 0.26 +
      moduleScore * 0.24 +
      symbolScore * 0.16 +
      routeBonus -
      domainPenalty -
      subdomainPenalty -
      testPenalty -
      privatePenalty -
      genericPenalty
  );
  const evidence = [
    { type: "query_match", detail: candidate.rawText, score: round(queryMatch) },
    { type: "entrypoint_type", detail: candidate.type, score: round(typeWeight) },
    { type: "module_proximity", detail: candidate.path, score: round(moduleScore) }
  ];
  if (symbolScore > 0) {
    evidence.push({ type: "symbol_exactness", detail: candidate.symbol ?? "", score: round(symbolScore) });
  }
  if (domainPenalty > 0) {
    evidence.push({ type: "domain_penalty", detail: candidate.path, score: round(-domainPenalty) });
  }
  if (subdomainPenalty > 0) {
    evidence.push({
      type: "subdomain_penalty",
      detail: candidate.symbol ?? candidate.path,
      score: round(-subdomainPenalty)
    });
  }
  return {
    type: candidate.type,
    symbol: candidate.symbol,
    path: candidate.path,
    routePath: candidate.routePath,
    method: candidate.method,
    score: finalScore,
    why: entrypointWhy(candidate.type, finalScore),
    evidence,
    scoreBreakdown: {
      queryMatch: round(queryMatch * 0.28),
      entrypointType: round(typeWeight * 0.26),
      moduleProximity: round(moduleScore * 0.24),
      symbolExactness: round(symbolScore * 0.16),
      routeBonus: round(routeBonus),
      domainPenalty: round(-domainPenalty),
      subdomainPenalty: round(-subdomainPenalty),
      testPenalty: round(-testPenalty),
      privatePenalty: round(-privatePenalty),
      genericPenalty: round(-genericPenalty)
    }
  };
}

export function discoveryReadScore(task: string, filePath: string, baseScore: number): number {
  const profile = buildDiscoveryIntentProfile(task);
  const path = filePath.toLowerCase();
  const moduleScore = moduleProximity(profile, path);
  const penalty = discoveryNoisePenalty(profile, filePath);
  const testPenalty = !profile.test && /(^|\/)(test|tests)\//.test(filePath) ? 0.15 : 0;
  return clampScore(baseScore * 0.55 + moduleScore * 0.4 - penalty - testPenalty);
}

export function tierReadOrder(task: string, items: FileHit[], limit = 15): ReadOrderTiers {
  const profile = buildDiscoveryIntentProfile(task);
  const sorted = items
    .map((item) => ({ ...item, score: discoveryReadScore(task, item.path, item.score) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const mustRead: FileHit[] = [];
  const shouldInspect: FileHit[] = [];
  const ignoreForNow: FileHit[] = [];
  for (const item of sorted) {
    const path = item.path.toLowerCase();
    const isNoise = discoveryNoisePenalty(profile, item.path) >= 0.35;
    const isTest = /(^|\/)(test|tests)\//.test(item.path);
    const isCore =
      item.score >= 0.72 &&
      !isNoise &&
      !isTest &&
      (moduleProximity(profile, path) >= 0.55 || path.includes("router") || path.includes("route"));
    if (isCore && mustRead.length < 5) {
      mustRead.push(item);
    } else if (!isNoise && shouldInspect.length < limit) {
      shouldInspect.push(item);
    } else if (ignoreForNow.length < limit) {
      ignoreForNow.push(item);
    }
  }
  return { mustRead, shouldInspect: shouldInspect.slice(0, limit), ignoreForNow: ignoreForNow.slice(0, limit) };
}

export function reuseVerdict(task: string, hit: SimilarCodeHit): SimilarCodeHit {
  const profile = buildDiscoveryIntentProfile(task);
  const moduleScore = moduleProximity(profile, hit.path.toLowerCase());
  let verdict: SimilarCodeHit["verdict"] = "create_new_allowed";
  if (hit.similarity >= 0.85 && moduleScore >= 0.45) {
    verdict = "reuse_as_is";
  } else if (hit.similarity >= 0.65 && moduleScore >= 0.4) {
    verdict = "extend_existing";
  } else if (hit.similarity >= 0.72) {
    verdict = "extract_shared";
  }
  return {
    ...hit,
    verdict,
    suggestion: reuseSuggestion(verdict, hit),
    scoreBreakdown: {
      similarity: hit.similarity,
      moduleProximity: round(moduleScore),
      domainPenalty: round(-discoveryNoisePenalty(profile, hit.path))
    }
  };
}

export function discoveryNoisePenalty(profile: DiscoveryIntentProfile, filePath: string): number {
  const path = filePath.toLowerCase();
  let penalty = 0;
  if (profile.frontendUi && !profile.api && /^(backend|database|infra)\//.test(path)) {
    penalty += 0.45;
  }
  if (profile.frontendUi && !profile.e2e && /(maestro|patrol|screenshot|golden|ocr|qa)/.test(path)) {
    penalty += 0.25;
  }
  if (profile.api && path.startsWith("frontend/lib/modules/design_system/")) {
    penalty += 0.35;
  }
  return penalty;
}

function irrelevantSubdomainPenalty(profile: DiscoveryIntentProfile, filePath: string, symbol: string): number {
  const combined = `${filePath} ${symbol}`.toLowerCase();
  const tokens = profile.tokens.join(" ");
  let penalty = 0;
  for (const token of ["lookup", "level", "management", "platform", "plan", "admin", "pr"]) {
    if (combined.includes(token) && !tokens.includes(token)) {
      penalty += 0.09;
    }
  }
  if (
    profile.dashboard &&
    combined.includes("dashboard_page") &&
    !/lookup|management|platform|plan|admin|pr/.test(combined)
  ) {
    penalty -= 0.06;
  }
  return Math.max(0, Math.min(0.24, penalty));
}

function entrypointTypeWeight(type: string, symbol: string, path: string): number {
  if (type === "flutter_route" || type === "fastapi_route") {
    return 1;
  }
  if (/Page|Screen|View$/.test(symbol)) {
    return 0.92;
  }
  if (type === "flutter_page_widget") {
    return path.includes("page") || path.includes("screen") || path.includes("view") ? 0.86 : 0.62;
  }
  if (type === "react_component") {
    return 0.7;
  }
  if (type === "test_entry") {
    return 0.35;
  }
  if (type === "cli_command") {
    return 0.28;
  }
  return 0.48;
}

function moduleProximity(profile: DiscoveryIntentProfile, path: string): number {
  let score = 0;
  if (profile.frontendUi && path.startsWith("frontend/lib/")) {
    score += 0.35;
  }
  if (profile.dashboard && path.includes("dashboard")) {
    score += 0.28;
  }
  if (profile.athlete && path.includes("athlete")) {
    score += 0.22;
  }
  if (profile.dashboard && profile.athlete && path.includes("user_core/dashboard")) {
    score += 0.25;
  }
  if (profile.api && path.startsWith("backend/")) {
    score += 0.45;
  }
  if (profile.test && /(^|\/)(test|tests)\//.test(path)) {
    score += 0.25;
  }
  return Math.min(1, score);
}

function symbolExactness(profile: DiscoveryIntentProfile, symbol: string): number {
  let score = 0;
  if (profile.dashboard && symbol.includes("dashboard")) {
    score += 0.34;
  }
  if (profile.athlete && symbol.includes("athlete")) {
    score += 0.32;
  }
  if (profile.tokens.some((token) => token.length > 2 && symbol.includes(token))) {
    score += 0.24;
  }
  if (/page|screen|view/.test(symbol)) {
    score += 0.1;
  }
  return Math.min(1, score);
}

function entrypointWhy(type: string, score: number): string {
  if (type.includes("route")) {
    return "Route or page entrypoint with task/module evidence.";
  }
  if (score >= 0.72) {
    return "High-confidence page/module entrypoint for this discovery task.";
  }
  return "Candidate entrypoint; inspect after higher-confidence route/page roots.";
}

function reuseSuggestion(verdict: NonNullable<SimilarCodeHit["verdict"]>, hit: SimilarCodeHit): string {
  if (verdict === "reuse_as_is") {
    return `Reuse ${hit.qualifiedName ?? hit.symbol ?? hit.path} before creating new code.`;
  }
  if (verdict === "extend_existing") {
    return `Extend or parameterize ${hit.qualifiedName ?? hit.symbol ?? hit.path} instead of duplicating it.`;
  }
  if (verdict === "extract_shared") {
    return `Inspect for shared extraction; this looks structurally close enough to create duplication risk.`;
  }
  return "No strong reuse verdict; creating new code is acceptable after checking higher-ranked candidates.";
}

function clampScore(value: number): number {
  return round(Math.max(0, Math.min(0.99, value)));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
