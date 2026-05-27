import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrations.js";

const tempDirs: string[] = [];

function tempDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pnav-db-"));
  tempDirs.push(dir);
  return path.join(dir, "project.sqlite");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("migrate", () => {
  it("creates the initial schema exactly once", () => {
    const db = openDatabase(tempDbPath());
    try {
      const first = migrate(db);
      const second = migrate(db);

      expect(first.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(first.currentVersion).toBe(8);
      expect(second.applied).toEqual([]);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual') ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);

      expect(tables).toContain("repos");
      expect(tables).toContain("scan_runs");
      expect(tables).toContain("files");
      expect(tables).toContain("symbols");
      expect(tables).toContain("edges");
      expect(tables).toContain("commands");
      expect(tables).toContain("project_rules");
      expect(tables).toContain("memories");
      expect(tables).toContain("tasks");
      expect(tables).toContain("memory_tags");
      expect(tables).toContain("documents");
      expect(tables).toContain("document_targets");
      expect(tables).toContain("document_steps");
      expect(tables).toContain("guard_rules");
      expect(tables).toContain("task_runs");
      expect(tables).toContain("task_sessions");
      expect(tables).toContain("task_session_files");
      expect(tables).toContain("finish_audits");
      expect(tables).toContain("code_blocks");
      expect(tables).toContain("symbol_edges");
      expect(tables).toContain("similarity_clusters");
      expect(tables).toContain("similarity_members");
      expect(tables).toContain("modules");
      expect(tables).toContain("import_bindings");
      expect(tables).toContain("discovery_chains");
      expect(tables).toContain("semantic_edges");
      expect(tables).toContain("structural_fingerprints");
      expect(tables).toContain("discovery_eval_runs");
      expect(tables).toContain("schema_migrations");
    } finally {
      db.close();
    }
  });

  it("applies v7 when incremental scan columns already exist", () => {
    const db = openDatabase(tempDbPath());
    try {
      migrate(db);

      db.exec(`
        DELETE FROM schema_migrations WHERE version = 7;
        DROP TABLE IF EXISTS import_bindings;
        DROP TABLE IF EXISTS discovery_chains;
      `);

      const result = migrate(db);
      expect(result.applied).toEqual([7]);

      const fileColumns = db
        .prepare("PRAGMA table_info(files)")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(fileColumns).toContain("last_scanned_at");
      expect(fileColumns).toContain("deleted_at");

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tables).toContain("import_bindings");
      expect(tables).toContain("discovery_chains");
    } finally {
      db.close();
    }
  });
});
