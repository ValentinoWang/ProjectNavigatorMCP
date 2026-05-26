import { execFileSync } from "node:child_process";
import type { CoChange } from "./types.js";

export function getGitSha(repoRoot: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

export function scanCoChanges(repoRoot: string, knownFiles: Set<string>, maxCommits = 200): CoChange[] {
  let output: string;
  try {
    output = execFileSync("git", ["log", "-n", `${maxCommits}`, "--name-only", "--pretty=format:--PNAV-COMMIT--"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return [];
  }

  const counts = new Map<string, number>();
  for (const block of output.split("--PNAV-COMMIT--")) {
    const files = Array.from(
      new Set(
        block
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => knownFiles.has(line))
      )
    ).slice(0, 30);
    for (let i = 0; i < files.length; i += 1) {
      for (let j = i + 1; j < files.length; j += 1) {
        const [a, b] = files[i] < files[j] ? [files[i], files[j]] : [files[j], files[i]];
        const key = `${a}\u0000${b}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1000)
    .map(([key, weight]) => {
      const [fromPath, toPath] = key.split("\u0000");
      return { fromPath, toPath, weight };
    });
}
