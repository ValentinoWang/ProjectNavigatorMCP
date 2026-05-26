import { openProject } from "../db/project.js";
import type { ModuleHit } from "./types.js";
import { findEntrypoints } from "./entrypoints.js";
import { findReusableComponents } from "./reuse.js";

export function moduleMap(repoPath: string, scope = "", limit = 30): { modules: ModuleHit[] } {
  const project = openProject(repoPath);
  try {
    const rows = project.db
      .prepare(
        `SELECT name, root_path AS root, module_type AS moduleType, summary
         FROM modules
         WHERE repo_id = ? AND (? = '' OR root_path LIKE ? OR name LIKE ?)
         ORDER BY root_path
         LIMIT ?`
      )
      .all(project.repo.id, scope, `%${scope}%`, `%${scope}%`, limit) as Array<{
      name: string;
      root: string;
      moduleType: string;
      summary: string | null;
    }>;
    return {
      modules: rows.map((row) => ({
        name: row.name,
        root: row.root,
        moduleType: row.moduleType,
        summary: row.summary,
        entrypoints: findEntrypoints(repoPath, row.name, 5).entrypoints.filter((entry) =>
          entry.path.startsWith(row.root)
        ),
        coreFiles: coreFiles(project.db, project.repo.id, row.root),
        dependencies: dependencyPaths(project.db, project.repo.id, row.root, "out"),
        dependents: dependencyPaths(project.db, project.repo.id, row.root, "in"),
        tests: testsForRoot(project.db, project.repo.id, row.root),
        duplicateClusters: findReusableComponents(repoPath, row.name, 5).duplicateRisks.filter((hit) =>
          hit.path.startsWith(row.root)
        )
      }))
    };
  } finally {
    project.db.close();
  }
}

function coreFiles(db: any, repoId: number, root: string): string[] {
  return db
    .prepare("SELECT path FROM files WHERE repo_id = ? AND path LIKE ? ORDER BY path LIMIT 12")
    .all(repoId, `${root}%`)
    .map((row: { path: string }) => row.path);
}

function testsForRoot(db: any, repoId: number, root: string): string[] {
  return db
    .prepare(
      `SELECT tf.path
       FROM tests t JOIN files tf ON tf.id = t.test_file_id LEFT JOIN files sf ON sf.id = t.target_file_id
       WHERE t.repo_id = ? AND (tf.path LIKE ? OR sf.path LIKE ?)
       ORDER BY tf.path LIMIT 12`
    )
    .all(repoId, `${root}%`, `${root}%`)
    .map((row: { path: string }) => row.path);
}

function dependencyPaths(db: any, repoId: number, root: string, direction: "in" | "out"): string[] {
  const rows =
    direction === "out"
      ? db
          .prepare(
            `SELECT DISTINCT tf.path
             FROM edges e JOIN files ff ON ff.id = e.from_id JOIN files tf ON tf.id = e.to_id
             WHERE e.repo_id = ? AND e.kind = 'imports' AND ff.path LIKE ? AND tf.path NOT LIKE ?
             ORDER BY tf.path LIMIT 20`
          )
          .all(repoId, `${root}%`, `${root}%`)
      : db
          .prepare(
            `SELECT DISTINCT ff.path
             FROM edges e JOIN files ff ON ff.id = e.from_id JOIN files tf ON tf.id = e.to_id
             WHERE e.repo_id = ? AND e.kind = 'imports' AND tf.path LIKE ? AND ff.path NOT LIKE ?
             ORDER BY ff.path LIMIT 20`
          )
          .all(repoId, `${root}%`, `${root}%`);
  return rows.map((row: { path: string }) => row.path);
}
