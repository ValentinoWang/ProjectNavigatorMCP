import { loadProjectConfig, matchesAnyPattern } from "../config/projectConfig.js";
import { openProject } from "../db/project.js";
import { findRelatedFiles } from "./relatedFiles.js";
import { scoreText } from "./scoring.js";
import type { CommandHit, RelatedTestsResult } from "./types.js";

export function relatedTests(repoPath: string, changedFiles: string[], task = ""): RelatedTestsResult {
  const project = openProject(repoPath);
  try {
    const config = loadProjectConfig(repoPath);
    const db = project.db;
    const repoId = project.repo.id;
    const tests = new Set<string>();
    const commands = new Map<string, CommandHit>();

    for (const file of changedFiles) {
      const rows = db
        .prepare(
          `SELECT tf.path AS testPath, t.command, t.confidence
           FROM tests t
           JOIN files sf ON sf.id = t.target_file_id
           JOIN files tf ON tf.id = t.test_file_id
           WHERE t.repo_id = ? AND sf.path = ?`
        )
        .all(repoId, file) as Array<{ testPath: string; command: string; confidence: number }>;
      for (const row of rows) {
        tests.add(row.testPath);
        if (row.command) {
          commands.set(row.command, {
            name: row.command,
            command: row.command,
            sourceFile: row.testPath,
            category: "test",
            confidence: row.confidence,
            reason: "Direct test relationship."
          });
        }
      }
    }

    const related = task ? findRelatedFiles(repoPath, task, 30).files : [];
    for (const file of related) {
      if (/test|tests|guard/.test(file.path)) {
        tests.add(file.path);
      }
    }

    const commandRows = db
      .prepare("SELECT name, command, source_file AS sourceFile, category FROM commands WHERE repo_id = ?")
      .all(repoId) as CommandHit[];
    for (const row of commandRows) {
      const score = Math.max(
        scoreText(task, row.name),
        scoreText(task, row.command),
        scoreText(changedFiles.join(" "), row.command)
      );
      const guardBoost = /guard|test|analyze|lint/.test(row.category) ? 0.2 : 0;
      const taskBoost = commandTaskBoost(task, row.command, config);
      if (score + guardBoost + taskBoost > 0.15) {
        commands.set(row.command, {
          ...row,
          confidence: Math.min(1, score + guardBoost + taskBoost),
          reason: "Command name/category matches task or changed files."
        });
      }
    }

    return {
      commands: Array.from(commands.values())
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 20),
      testFiles: Array.from(tests).sort().slice(0, 30)
    };
  } finally {
    project.db.close();
  }
}

function commandTaskBoost(task: string, command: string, config: ReturnType<typeof loadProjectConfig>): number {
  const loweredTask = task.toLowerCase();
  let boost = 0;
  for (const domain of config.domains) {
    const taskMatches = domain.keywords.some((keyword) => loweredTask.includes(keyword.toLowerCase()));
    if (taskMatches && matchesAnyPattern(command, domain.commands)) {
      boost += 0.65;
    }
  }
  return boost;
}
