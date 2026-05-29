import { discoverCode } from "../discovery/discoverCode.js";
import type { EvidenceItem } from "../discovery/types.js";
import { findReusableComponents } from "../discovery/reuse.js";
import { findCallers, findCallees } from "../discovery/symbolGraph.js";
import { relatedTests } from "./relatedTests.js";

export interface ImpactAnalysisV3Result {
  target: string;
  impact: {
    directConsumers: unknown[];
    affectedEntrypoints: string[];
    affectedRoles: string[];
    affectedWidgets: string[];
    affectedViewModels: string[];
    affectedTests: string[];
    affectedGuards: string[];
    reuseClusterImpact: unknown[];
    cochangeOnly: string[];
    riskLevel: "low" | "medium" | "high";
    why: string[];
    evidence: EvidenceItem[];
  };
}

export function impactAnalysisV3(repoPath: string, target: string, task = target): ImpactAnalysisV3Result {
  const callers = findCallers(repoPath, target, 20).callers;
  const callees = findCallees(repoPath, target, 20).callees;
  const discovery = discoverCode(repoPath, task, 12);
  const tests = relatedTests(
    repoPath,
    [target, ...discovery.authoritativeHandoff.mustRead.map((item) => item.path)],
    task
  );
  const reuse = findReusableComponents(repoPath, task, 10);
  const affectedWidgets = unique(
    [...callers, ...callees]
      .map((item) => item.qualifiedName ?? item.symbol)
      .filter((name) => /Widget|Card|Page|View|Section|Tile|Dashboard/i.test(name))
  );
  const affectedViewModels = unique(
    [...callers, ...callees]
      .map((item) => item.qualifiedName ?? item.symbol)
      .filter((name) => /ViewModel|Provider|Controller/i.test(name))
  );
  const affectedEntrypoints = unique(discovery.authoritativeHandoff.coreChain.map((step) => step.path));
  const affectedRoles = unique(
    affectedEntrypoints
      .join(" ")
      .match(/\b(admin|athlete|coach|trainer|user|owner)\b/gi)
      ?.map((role) => role.toLowerCase()) ?? []
  );
  const criticalCount = affectedEntrypoints.length + affectedWidgets.length + tests.testFiles.length;
  return {
    target,
    impact: {
      directConsumers: callers,
      affectedEntrypoints,
      affectedRoles,
      affectedWidgets,
      affectedViewModels,
      affectedTests: tests.testFiles,
      affectedGuards: tests.commands
        .filter((command) => command.category === "guard")
        .map((command) => command.command),
      reuseClusterImpact: reuse.duplicateRisks,
      cochangeOnly: discovery.impactPreview
        .filter((item) => !affectedEntrypoints.includes(item.path))
        .slice(0, 8)
        .map((item) => item.path),
      riskLevel: criticalCount >= 8 ? "high" : criticalCount >= 3 ? "medium" : "low",
      why: [
        "UI composition and entrypoint evidence outrank import-only consumers.",
        "Tests and guards require path/name evidence before becoming critical impact.",
        "Git co-change neighbors are secondary evidence only."
      ],
      evidence: [
        { type: "symbol_graph", detail: "Direct callers and callees from symbol_edges.", freshness: "fresh" },
        { type: "test_relation", detail: "Related tests and guards from path/name evidence.", freshness: "fresh" },
        {
          type: "git_cochange",
          detail: "Co-change neighbors are secondary and stale until the next full scan.",
          freshness: "stale_until_full_scan"
        }
      ]
    }
  };
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
