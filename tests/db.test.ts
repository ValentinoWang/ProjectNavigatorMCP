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

      expect(first.applied).toEqual([1, 2, 3, 4]);
      expect(first.currentVersion).toBe(4);
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
      expect(tables).toContain("schema_migrations");
    } finally {
      db.close();
    }
  });
});
