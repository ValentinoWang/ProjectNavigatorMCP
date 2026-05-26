import { openProject } from "../db/project.js";
import { parseJsonArray } from "../shared/json.js";
import { scoreText } from "../graph/scoring.js";

export interface MemoryHit {
  id: number;
  topic: string;
  summary: string;
  files: string[];
  commands: string[];
  score: number;
  createdAt: string;
}

export interface RememberTaskInput {
  title: string;
  summary: string;
  changedFiles?: string[];
  tests?: string[];
  tags?: string[];
}

export function searchProjectMemory(repoPath: string, query: string, limit = 10): MemoryHit[] {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare("SELECT id, topic, summary, files_json AS filesJson, commands_json AS commandsJson, created_at AS createdAt FROM memories WHERE repo_id = ? ORDER BY id DESC LIMIT 200")
      .all(project.repo.id) as Array<{ id: number; topic: string; summary: string; filesJson: string; commandsJson: string; createdAt: string }>;
    return rows
      .map((row) => ({
        id: row.id,
        topic: row.topic,
        summary: row.summary,
        files: parseJsonArray(row.filesJson),
        commands: parseJsonArray(row.commandsJson),
        score: Math.max(scoreText(query, row.topic), scoreText(query, row.summary)),
        createdAt: row.createdAt
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } finally {
    project.db.close();
  }
}

export function rememberTask(repoPath: string, input: RememberTaskInput): { stored: true; memoryId: number } {
  const project = openProject(repoPath);
  try {
    const result = project.db
      .prepare("INSERT INTO memories (repo_id, topic, summary, files_json, commands_json) VALUES (?, ?, ?, ?, ?)")
      .run(
        project.repo.id,
        input.title,
        input.summary,
        JSON.stringify(input.changedFiles ?? []),
        JSON.stringify(input.tests ?? [])
      );
    project.db
      .prepare("INSERT INTO tasks (repo_id, title, summary, changed_files_json, tests_json) VALUES (?, ?, ?, ?, ?)")
      .run(project.repo.id, input.title, input.summary, JSON.stringify(input.changedFiles ?? []), JSON.stringify(input.tests ?? []));
    return { stored: true, memoryId: Number(result.lastInsertRowid) };
  } finally {
    project.db.close();
  }
}

