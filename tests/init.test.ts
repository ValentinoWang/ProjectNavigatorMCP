import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/connection.js";
import { initProject } from "../src/cli/commands/init.js";

const tempDirs: string[] = [];

function copyFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-fixture-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/tiny-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("initProject", () => {
  it("creates a project-local SQLite index and config", () => {
    const repo = copyFixtureRepo();
    const result = initProject(repo);

    expect(existsSync(result.dbPath)).toBe(true);
    expect(existsSync(result.configPath)).toBe(true);
    expect(result.appliedMigrations).toEqual([1, 2]);

    const config = JSON.parse(readFileSync(result.configPath, "utf8")) as { repoRoot: string };
    expect(config.repoRoot).toBe(repo);

    const db = openDatabase(result.dbPath);
    try {
      const repoRow = db.prepare("SELECT root_path, name FROM repos").get() as {
        root_path: string;
        name: string;
      };
      expect(repoRow.root_path).toBe(repo);
      expect(repoRow.name).toBe(path.basename(repo));
    } finally {
      db.close();
    }
  });

  it("is idempotent and does not reapply migrations", () => {
    const repo = copyFixtureRepo();
    initProject(repo);
    const second = initProject(repo);

    expect(second.appliedMigrations).toEqual([]);
    expect(existsSync(second.dbPath)).toBe(true);
  });
});
