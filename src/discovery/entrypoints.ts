import { openProject } from "../db/project.js";
import { scoreText } from "../graph/scoring.js";
import { scoreEntrypointCandidate } from "./discoveryQuality.js";
import type { EntrypointHit } from "./types.js";

export function findEntrypoints(repoPath: string, task: string, limit = 10): { entrypoints: EntrypointHit[] } {
  const project = openProject(repoPath);
  try {
    const hits: EntrypointHit[] = [];
    const routes = project.db
      .prepare(
        `SELECT r.framework, r.method, r.path AS routePath, r.name, f.path AS filePath
         FROM routes r LEFT JOIN files f ON f.id = r.file_id
         WHERE r.repo_id = ?`
      )
      .all(project.repo.id) as Array<{
      framework: string;
      method: string | null;
      routePath: string;
      name: string | null;
      filePath: string | null;
    }>;
    for (const route of routes) {
      const hit = scoreEntrypointCandidate(task, {
        type: route.framework === "fastapi" ? "fastapi_route" : "flutter_route",
        symbol: route.name,
        path: route.filePath ?? "",
        routePath: route.routePath,
        method: route.method,
        rawText: `${route.routePath} ${route.name ?? ""} ${route.filePath ?? ""}`
      });
      if (hit.score > 0.16) {
        hits.push(hit);
      }
    }

    const symbols = project.db
      .prepare(
        `SELECT s.name, s.qualified_name AS qualifiedName, s.kind, f.path
         FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ? AND (
           s.kind IN ('class', 'component') OR s.name LIKE '%Page' OR s.name LIKE '%Screen' OR s.name LIKE '%View' OR s.name LIKE '%Widget'
         )`
      )
      .all(project.repo.id) as Array<{ name: string; qualifiedName: string | null; kind: string; path: string }>;
    for (const symbol of symbols) {
      const hit = scoreEntrypointCandidate(task, {
        type: entrypointType(symbol.path, symbol.name, symbol.kind),
        symbol: symbol.qualifiedName ?? symbol.name,
        path: symbol.path,
        rawText: `${symbol.name} ${symbol.qualifiedName ?? ""} ${symbol.path}`
      });
      if (hit.score > 0.16) {
        hits.push(hit);
      }
    }

    const commands = project.db
      .prepare("SELECT name, command, source_file AS sourceFile, category FROM commands WHERE repo_id = ?")
      .all(project.repo.id) as Array<{ name: string; command: string; sourceFile: string; category: string }>;
    for (const command of commands) {
      const score = scoreText(task, `${command.name} ${command.command} ${command.sourceFile}`);
      if (score > 0.15 || (command.category === "test" && score > 0)) {
        const hit = scoreEntrypointCandidate(task, {
          type: command.category === "test" ? "test_entry" : "cli_command",
          symbol: command.name,
          path: command.sourceFile,
          rawText: `${command.name} ${command.command} ${command.sourceFile}`
        });
        if (hit.score > 0.16) {
          hits.push({
            ...hit,
            why: "Command catalog entry may validate this workflow.",
            evidence: [...hit.evidence, { type: "command_match", detail: command.command, score }]
          });
        }
      }
    }

    return {
      entrypoints: dedupeEntrypoints(hits)
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, limit)
    };
  } finally {
    project.db.close();
  }
}

function entrypointType(path: string, name: string, kind: string): string {
  if (path.endsWith(".dart") && /Page|Screen|View|Widget/.test(name)) {
    return "flutter_page_widget";
  }
  if (path.endsWith(".tsx") || kind === "component") {
    return "react_component";
  }
  return "symbol_entry";
}

function dedupeEntrypoints(items: EntrypointHit[]): EntrypointHit[] {
  const best = new Map<string, EntrypointHit>();
  for (const item of items) {
    const key = `${item.type}:${item.path}:${item.symbol ?? ""}:${item.routePath ?? ""}`;
    const existing = best.get(key);
    if (!existing || item.score > existing.score) {
      best.set(key, item);
    }
  }
  return Array.from(best.values());
}
