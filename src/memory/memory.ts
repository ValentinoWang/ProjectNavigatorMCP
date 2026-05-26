import { openProject } from "../db/project.js";
import type { ProjectDatabase } from "../db/connection.js";
import { parseJsonArray } from "../shared/json.js";
import { scoreText } from "../graph/scoring.js";

export interface MemoryHit {
  id: number;
  topic: string;
  summary: string;
  files: string[];
  commands: string[];
  tags: string[];
  memoryType: string;
  confidence: number;
  score: number;
  createdAt: string;
}

export interface RememberTaskInput {
  title: string;
  summary: string;
  changedFiles?: string[];
  tests?: string[];
  tags?: string[];
  decisions?: string[];
  pitfalls?: string[];
  validation?: string[];
  memoryType?: string;
  confidence?: number;
}

export function searchProjectMemory(repoPath: string, query: string, limit = 10): MemoryHit[] {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT m.id, m.topic, m.summary, m.files_json AS filesJson, m.commands_json AS commandsJson,
                m.memory_type AS memoryType, m.confidence, m.created_at AS createdAt,
                bm25(memories_fts) AS rank
         FROM memories_fts
         JOIN memories m ON m.id = memories_fts.rowid
         WHERE m.repo_id = ? AND memories_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(project.repo.id, toFtsQuery(query), limit) as Array<{
      id: number;
      topic: string;
      summary: string;
      filesJson: string;
      commandsJson: string;
      memoryType: string;
      confidence: number;
      createdAt: string;
    }>;
    const hits = rows.map((row, index) => toMemoryHit(project.db, row, 1 - index / Math.max(1, rows.length)));
    if (hits.length > 0) {
      return hits;
    }
    return fallbackMemorySearch(repoPath, query, limit);
  } finally {
    project.db.close();
  }
}

export function rememberTask(repoPath: string, input: RememberTaskInput): { stored: true; memoryId: number } {
  const project = openProject(repoPath);
  try {
    const result = project.db
      .prepare(
        `INSERT INTO memories
          (repo_id, memory_type, topic, summary, files_json, commands_json, decisions_json, pitfalls_json, validation_json, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        project.repo.id,
        input.memoryType ?? "task",
        input.title,
        input.summary,
        JSON.stringify(input.changedFiles ?? []),
        JSON.stringify(input.tests ?? []),
        JSON.stringify(input.decisions ?? []),
        JSON.stringify(input.pitfalls ?? []),
        JSON.stringify(input.validation ?? input.tests ?? []),
        input.confidence ?? 1.0
      );
    const memoryId = Number(result.lastInsertRowid);
    const insertTag = project.db.prepare("INSERT OR IGNORE INTO memory_tags (memory_id, tag) VALUES (?, ?)");
    for (const tag of input.tags ?? []) {
      insertTag.run(memoryId, tag);
    }
    project.db
      .prepare("INSERT INTO tasks (repo_id, title, summary, changed_files_json, tests_json) VALUES (?, ?, ?, ?, ?)")
      .run(
        project.repo.id,
        input.title,
        input.summary,
        JSON.stringify(input.changedFiles ?? []),
        JSON.stringify(input.tests ?? [])
      );
    return { stored: true, memoryId };
  } finally {
    project.db.close();
  }
}

function fallbackMemorySearch(repoPath: string, query: string, limit: number): MemoryHit[] {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT id, topic, summary, files_json AS filesJson, commands_json AS commandsJson,
                memory_type AS memoryType, confidence, created_at AS createdAt
         FROM memories WHERE repo_id = ? ORDER BY id DESC LIMIT 200`
      )
      .all(project.repo.id) as Array<{
      id: number;
      topic: string;
      summary: string;
      filesJson: string;
      commandsJson: string;
      memoryType: string;
      confidence: number;
      createdAt: string;
    }>;
    return rows
      .map((row) => toMemoryHit(project.db, row, Math.max(scoreText(query, row.topic), scoreText(query, row.summary))))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } finally {
    project.db.close();
  }
}

function toMemoryHit(
  db: ProjectDatabase,
  row: {
    id: number;
    topic: string;
    summary: string;
    filesJson: string;
    commandsJson: string;
    memoryType: string;
    confidence: number;
    createdAt: string;
  },
  score: number
): MemoryHit {
  const tagRows = db.prepare("SELECT tag FROM memory_tags WHERE memory_id = ? ORDER BY tag").all(row.id) as Array<{
    tag: string;
  }>;
  return {
    id: row.id,
    topic: row.topic,
    summary: row.summary,
    files: parseJsonArray(row.filesJson),
    commands: parseJsonArray(row.commandsJson),
    tags: tagRows.map((item) => item.tag),
    memoryType: row.memoryType,
    confidence: row.confidence,
    score,
    createdAt: row.createdAt
  };
}

function toFtsQuery(query: string): string {
  const terms = query
    .replace(/["']/g, " ")
    .split(/[^A-Za-z0-9_\u4e00-\u9fa5]+/u)
    .filter((term) => term.length > 1)
    .slice(0, 8);
  return terms.length > 0 ? terms.map((term) => `"${term}"`).join(" OR ") : '"__pnav_no_match__"';
}
