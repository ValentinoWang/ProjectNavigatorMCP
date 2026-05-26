import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { getWorktreeStatus } from "../src/git/worktreeStatus.js";

const tempDirs: string[] = [];

function makeGitRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-worktree-"));
  tempDirs.push(root);
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "src/main.ts"), "export const value = 1;\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root, stdio: "ignore" });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("getWorktreeStatus", () => {
  it("reports modified and untracked files", () => {
    const repo = makeGitRepo();
    writeFileSync(path.join(repo, "src/main.ts"), "export const value = 2;\n");
    writeFileSync(path.join(repo, "src/new.ts"), "export const value = 3;\n");

    const status = getWorktreeStatus(repo);
    expect(status.dirty).toBe(true);
    expect(status.modified).toContain("src/main.ts");
    expect(status.untracked).toContain("src/new.ts");
    expect(status.warnings.length).toBeGreaterThan(0);
  });
});
