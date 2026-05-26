import { openProject } from "../db/project.js";

export interface ResolvedSymbol {
  id: number;
  fileId: number;
  name: string;
  qualifiedName: string | null;
  kind: string;
  path: string;
  startLine: number;
  endLine: number;
}

export function resolveSymbol(repoPath: string, query: string): ResolvedSymbol | null {
  const project = openProject(repoPath);
  try {
    const normalized = query.trim();
    const byQualified = project.db
      .prepare(
        `SELECT s.id, s.file_id AS fileId, s.name, s.qualified_name AS qualifiedName, s.kind,
                f.path, s.start_line AS startLine, s.end_line AS endLine
         FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ? AND (s.qualified_name = ? OR s.name = ?)
         ORDER BY CASE WHEN s.qualified_name = ? THEN 0 ELSE 1 END, f.path
         LIMIT 1`
      )
      .get(project.repo.id, normalized, normalized, normalized) as ResolvedSymbol | undefined;
    if (byQualified) {
      return byQualified;
    }
    const byPath = project.db
      .prepare(
        `SELECT s.id, s.file_id AS fileId, s.name, s.qualified_name AS qualifiedName, s.kind,
                f.path, s.start_line AS startLine, s.end_line AS endLine
         FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE f.repo_id = ? AND f.path = ?
         ORDER BY s.start_line
         LIMIT 1`
      )
      .get(project.repo.id, normalized) as ResolvedSymbol | undefined;
    return byPath ?? null;
  } finally {
    project.db.close();
  }
}
