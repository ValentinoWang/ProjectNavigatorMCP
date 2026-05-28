import { findCallers } from "../discovery/symbolGraph.js";
import { findReusableComponents } from "../discovery/reuse.js";
import type { SimilarCodeHit } from "../discovery/types.js";
import { scanComponentApiFit, type ComponentApiFit } from "./componentApiScanner.js";

export interface ReuseDecisionV2 {
  verdict: "reuse_as_is" | "extend_existing" | "extract_shared" | "create_new_allowed" | "create_new_blocked";
  candidate: string | null;
  path: string | null;
  apiFit: ComponentApiFit | null;
  recommendedAction: string;
  affectedCallers: string[];
  evidence: string[];
}

export function decideReuseV2(
  repoPath: string,
  task: string,
  limit = 5,
  reuseCandidates?: SimilarCodeHit[]
): ReuseDecisionV2 {
  const candidates = reuseCandidates ?? findReusableComponents(repoPath, task, limit).reuseCandidates;
  const best = candidates.find((hit) => hit.verdict && hit.verdict !== "create_new_allowed") ?? candidates[0];
  if (!best) {
    return {
      verdict: "create_new_allowed",
      candidate: null,
      path: null,
      apiFit: null,
      recommendedAction: "No strong reuse candidate found.",
      affectedCallers: [],
      evidence: []
    };
  }
  const apiFit = scanComponentApiFit(repoPath, best.path, best.symbol ?? best.qualifiedName);
  const verdict = refineVerdict(best, apiFit);
  const affectedCallers = affectedCallersFor(repoPath, best);
  return {
    verdict,
    candidate: best.qualifiedName ?? best.symbol,
    path: best.path,
    apiFit,
    recommendedAction: actionFor(verdict, best, affectedCallers),
    affectedCallers,
    evidence: ["reuse_similarity", best.verdict ?? "candidate", apiFit.requiredParamsCovered ? "api_fit" : "api_gap"]
  };
}

function refineVerdict(hit: SimilarCodeHit, apiFit: ComponentApiFit): ReuseDecisionV2["verdict"] {
  if (hit.similarity >= 0.85 && apiFit.requiredParamsCovered) {
    return "reuse_as_is";
  }
  if ((hit.verdict === "extend_existing" || hit.similarity >= 0.65) && apiFit.missingParams.length <= 2) {
    return "extend_existing";
  }
  if (hit.similarity >= 0.72) {
    return "extract_shared";
  }
  return "create_new_allowed";
}

function affectedCallersFor(repoPath: string, hit: SimilarCodeHit): string[] {
  const queries = Array.from(new Set([hit.qualifiedName, hit.symbol, hit.path].filter(Boolean).map(String)));
  const callers = new Set<string>();
  for (const query of queries) {
    for (const caller of findCallers(repoPath, query, 20).callers) {
      callers.add(caller.path);
      if (callers.size >= 10) {
        return Array.from(callers);
      }
    }
  }
  return Array.from(callers);
}

function actionFor(verdict: ReuseDecisionV2["verdict"], hit: SimilarCodeHit, affectedCallers: string[]): string {
  const target = hit.qualifiedName ?? hit.symbol ?? hit.path;
  const callerReview =
    affectedCallers.length >= 5
      ? " Review existing callers carefully before changing shared API."
      : affectedCallers.length > 0
        ? " Review existing callers before changing shared API."
        : " No existing callers were found by the symbol graph.";
  if (verdict === "reuse_as_is") {
    return `Reuse ${target} directly before creating a new implementation.${callerReview}`;
  }
  if (verdict === "extend_existing") {
    return `Extend ${target} with optional API rather than creating a duplicate component.${callerReview}`;
  }
  if (verdict === "extract_shared") {
    return `Extract the shared shape from ${target}; migrate or review existing callers during extraction.${callerReview}`;
  }
  if (verdict === "create_new_blocked") {
    return `Do not create a new implementation until the strong reuse candidate ${target} is evaluated.`;
  }
  return `Creating new code is allowed after inspecting the top reuse candidates.${callerReview}`;
}
