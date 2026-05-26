import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProject } from "../src/db/project.js";
import { getRepoMap } from "../src/graph/repoMap.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-scan-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/tiny-repo"), root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanRepo", () => {
  it("indexes files, symbols, commands, rules, and tests", () => {
    const repo = copyFixtureRepo();
    const result = scanRepo(repo);

    expect(existsSync(path.join(repo, ".pnav/project.sqlite"))).toBe(true);
    expect(result.files).toBeGreaterThanOrEqual(5);
    expect(result.symbols).toBeGreaterThanOrEqual(1);
    expect(result.commands).toBeGreaterThanOrEqual(2);
    expect(result.rules).toBeGreaterThanOrEqual(1);
    expect(result.tests).toBeGreaterThanOrEqual(1);

    const map = getRepoMap(repo);
    expect(map.counts.files).toBe(result.files);
    expect(map.commands.map((command) => command.command)).toContain("make test");

    const project = openProject(repo);
    try {
      const symbol = project.db.prepare("SELECT name FROM symbols WHERE name = 'add'").get();
      expect(symbol).toBeTruthy();
    } finally {
      project.db.close();
    }
  });
});
