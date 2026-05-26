import type { TaskContext } from "./prepareTaskContext.js";

export function renderCapsule(context: TaskContext): string {
  const lines = [
    `# Task Context Capsule`,
    "",
    `Task: ${context.task}`,
    `Mode: ${context.mode}`,
    `Task Session: ${context.taskSessionId}`,
    `Interpretation: ${context.interpretation}`,
    `Domain: ${context.domain ? `${context.domain.name} (${context.domain.confidence.toFixed(2)})` : "unknown"}`,
    "",
    "## Source Document",
    ...(context.sourceDoc
      ? [
          `- path: ${context.sourceDoc.path}`,
          `- owner_domain: ${context.sourceDoc.ownerDomain ?? "unknown"}`,
          `- authority: ${context.sourceDoc.authority ?? "unknown"}`,
          `- sync_targets: ${normalizedSyncTargets(context).join(", ") || "none"}`
        ]
      : ["- none"]),
    "",
    "## Guard Findings",
    ...emptyAware(
      context.guardFindings.map(
        (finding) =>
          `- ${finding.file}${finding.line ? `:${finding.line}` : ""} (${finding.rule ?? "guard"}) - ${finding.message}`
      )
    ),
    "",
    "## Guard Recipes",
    ...emptyAware(
      context.guardRecipes.map(
        (recipe) =>
          `- ${recipe.ruleId} [${recipe.domain}] ${recipe.recipe.title}; validate: ${recipe.validationCommands.join(", ")}`
      )
    ),
    "",
    "## Minimal Repair Path",
    ...emptyAware(
      context.minimalRepairPath.steps.map(
        (step) =>
          `- ${step.order}. ${step.action}${step.target ? ` ${step.target}` : ""}${step.command ? ` \`${step.command}\`` : ""}${step.instruction ? ` — ${step.instruction}` : ""} (${step.why})`
      )
    ),
    "",
    "## Edit Boundary V2",
    ...emptyAware(context.editBoundaryV2.mustEditFiles.map((file) => `- must_edit: ${file}`)),
    ...context.editBoundaryV2.mayEditFiles.map((file) => `- may_edit: ${file}`),
    ...context.editBoundaryV2.mayInspectFiles.map((file) => `- may_inspect: ${file}`),
    ...context.editBoundaryV2.referenceOnlyFiles.map((file) => `- reference_only: ${file}`),
    ...context.editBoundaryV2.doNotTouchFiles.map((file) => `- do_not_touch: ${file}`),
    "",
    "## Core Read Order",
    ...emptyAware(
      context.coreReadOrder.map(
        (item) =>
          `- ${item.path}${item.line ? `:${item.line}` : ""} (${item.score.toFixed(2)}; ${item.editTier ?? "inspect"}) - ${item.why}`
      )
    ),
    "",
    "## Reference Read Order",
    ...emptyAware(
      context.referenceReadOrder.slice(0, 10).map((item) => `- ${item.path} (${item.score.toFixed(2)}) - ${item.why}`)
    ),
    "",
    "## Execution Plan",
    ...emptyAware(
      context.executionPlan.map(
        (item) =>
          `- ${item.order}. ${item.title}${item.command ? ` — \`${item.command}\`` : ""} (${item.score.toFixed(2)}; ${item.why})`
      )
    ),
    "",
    "## Edit Boundary",
    ...emptyAware(context.editBoundary.preferredFiles.map((file) => `- preferred: ${file}`)),
    ...context.editBoundary.doNotTouchWithoutReason.slice(0, 10).map((file) => `- pre-existing dirty context: ${file}`),
    "",
    "## Worktree Boundary",
    ...emptyAware(context.worktreeBoundary.allowedEditFiles.map((file) => `- allowed: ${file}`)),
    ...context.worktreeBoundary.riskyDirtyFiles.slice(0, 10).map((file) => `- risky pre-existing: ${file}`),
    ...context.worktreeBoundary.verifyDiffCommands.map((command) => `- verify: \`${command}\``),
    "",
    "## Likely Files",
    ...emptyAware(context.likelyFiles.map((file) => `- ${file.path} (${file.score.toFixed(2)}) - ${file.reason}`)),
    "",
    "## Symbols",
    ...emptyAware(
      context.symbols.map(
        (symbol) => `- ${symbol.name} [${symbol.kind}] ${symbol.path}:${symbol.startLine} (${symbol.score.toFixed(2)})`
      )
    ),
    "",
    "## Routes",
    ...emptyAware(
      context.routes.map((route) =>
        `- ${route.framework} ${route.method ?? ""} ${route.path} ${route.name ?? ""} (${route.routeFile ?? "unknown"})`.trim()
      )
    ),
    "",
    "## Recommended Tests And Commands",
    ...emptyAware(
      context.recommendedCommands.map((command) => `- ${command.command} (${command.reason ?? command.category})`)
    ),
    ...context.testFiles.map((file) => `- ${file}`),
    "",
    "## Discovery Mode",
    ...(context.discovery
      ? [
          `- entrypoints: ${
            context.discovery.entrypoints
              .map((entry) => entry.symbol ?? entry.path)
              .slice(0, 5)
              .join(", ") || "none"
          }`,
          `- reuse candidates: ${
            context.discovery.reuseCandidates
              .map((hit) => hit.qualifiedName ?? hit.symbol ?? hit.path)
              .slice(0, 5)
              .join(", ") || "none"
          }`,
          `- duplicate risks: ${
            context.discovery.duplicateRisks
              .map((hit) => hit.qualifiedName ?? hit.symbol ?? hit.path)
              .slice(0, 5)
              .join(", ") || "none"
          }`
        ]
      : ["- not requested"]),
    "",
    "## Project Rules",
    ...emptyAware(
      context.projectRules.map((rule) => `- ${rule.body} (${rule.sourceFile}${rule.title ? `: ${rule.title}` : ""})`)
    ),
    "",
    "## Memory Hits",
    ...emptyAware(
      context.memoryHits.map((memory) => `- ${memory.topic} (${memory.score.toFixed(2)}): ${memory.summary}`)
    ),
    "",
    "## Warnings",
    ...emptyAware(context.warnings.map((warning) => `- ${warning}`)),
    "",
    "## Next Steps",
    ...context.nextSteps.map((step) => `- ${step}`)
  ];
  return lines.join("\n");
}

function emptyAware(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- none"];
}

function normalizedSyncTargets(context: TaskContext): string[] {
  return (
    context.sourceDoc?.targets
      .filter((target) => target.kind === "sync_target" && target.confidence >= 0.9)
      .map((target) => target.targetPath) ?? []
  );
}
