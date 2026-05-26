import type { TaskContext } from "./prepareTaskContext.js";

export function renderCapsule(context: TaskContext): string {
  const lines = [
    `# Task Context Capsule`,
    "",
    `Task: ${context.task}`,
    `Interpretation: ${context.interpretation}`,
    "",
    "## Likely Files",
    ...emptyAware(context.likelyFiles.map((file) => `- ${file.path} (${file.score.toFixed(2)}) - ${file.reason}`)),
    "",
    "## Symbols",
    ...emptyAware(context.symbols.map((symbol) => `- ${symbol.name} [${symbol.kind}] ${symbol.path}:${symbol.startLine} (${symbol.score.toFixed(2)})`)),
    "",
    "## Routes",
    ...emptyAware(context.routes.map((route) => `- ${route.framework} ${route.method ?? ""} ${route.path} ${route.name ?? ""} (${route.routeFile ?? "unknown"})`.trim())),
    "",
    "## Recommended Tests And Commands",
    ...emptyAware(context.recommendedCommands.map((command) => `- ${command.command} (${command.reason ?? command.category})`)),
    ...context.testFiles.map((file) => `- ${file}`),
    "",
    "## Project Rules",
    ...emptyAware(context.projectRules.map((rule) => `- ${rule.body} (${rule.sourceFile}${rule.title ? `: ${rule.title}` : ""})`)),
    "",
    "## Memory Hits",
    ...emptyAware(context.memoryHits.map((memory) => `- ${memory.topic} (${memory.score.toFixed(2)}): ${memory.summary}`)),
    "",
    "## Next Steps",
    ...context.nextSteps.map((step) => `- ${step}`)
  ];
  return lines.join("\n");
}

function emptyAware(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- none"];
}

