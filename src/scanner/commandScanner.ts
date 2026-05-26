import path from "node:path";
import { readRepoTextFile } from "./fileScanner.js";
import type { ScannedCommand } from "./types.js";

export function scanCommands(repoRoot: string): ScannedCommand[] {
  return [
    ...scanMakefile(repoRoot),
    ...scanPackageJson(repoRoot),
    ...scanPubspec(repoRoot),
    ...scanPyproject(repoRoot)
  ];
}

function scanMakefile(repoRoot: string): ScannedCommand[] {
  const content = readRepoTextFile(repoRoot, "Makefile");
  if (!content) {
    return [];
  }
  const commands: ScannedCommand[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/);
    if (match && !match[1].startsWith(".")) {
      commands.push({
        name: match[1],
        command: `make ${match[1]}`,
        sourceFile: "Makefile",
        category: categorizeCommand(match[1])
      });
    }
  }
  return commands;
}

function scanPackageJson(repoRoot: string): ScannedCommand[] {
  const relativePath = "package.json";
  const content = readRepoTextFile(repoRoot, relativePath);
  if (!content) {
    return [];
  }
  const parsed = JSON.parse(content) as { scripts?: Record<string, string> };
  return Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({
    name,
    command: `npm run ${name}`,
    sourceFile: relativePath,
    category: categorizeCommand(`${name} ${command}`)
  }));
}

function scanPubspec(repoRoot: string): ScannedCommand[] {
  const candidates = ["pubspec.yaml", "frontend/pubspec.yaml"];
  return candidates.flatMap((relativePath) => {
    const content = readRepoTextFile(repoRoot, relativePath);
    if (!content) {
      return [];
    }
    const dir = path.posix.dirname(relativePath);
    const prefix = dir === "." ? "" : `cd ${dir} && `;
    return [
      {
        name: "flutter-test",
        command: `${prefix}flutter test`,
        sourceFile: relativePath,
        category: "test"
      },
      {
        name: "flutter-analyze",
        command: `${prefix}flutter analyze`,
        sourceFile: relativePath,
        category: "lint"
      }
    ];
  });
}

function scanPyproject(repoRoot: string): ScannedCommand[] {
  const content = readRepoTextFile(repoRoot, "pyproject.toml");
  if (!content) {
    return [];
  }
  return [
    {
      name: "pytest",
      command: "pytest",
      sourceFile: "pyproject.toml",
      category: "test"
    }
  ];
}

function categorizeCommand(value: string): string {
  const lowered = value.toLowerCase();
  if (lowered.includes("test") || lowered.includes("pytest") || lowered.includes("vitest")) {
    return "test";
  }
  if (lowered.includes("lint") || lowered.includes("analyze") || lowered.includes("ruff") || lowered.includes("mypy")) {
    return "lint";
  }
  if (lowered.includes("build")) {
    return "build";
  }
  if (lowered.includes("guard") || lowered.includes("quality")) {
    return "guard";
  }
  return "command";
}
