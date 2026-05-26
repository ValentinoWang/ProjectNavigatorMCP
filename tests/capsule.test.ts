import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { rememberTask, searchProjectMemory } from "../src/memory/memory.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-capsule-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/tiny-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("prepareTaskContext", () => {
  it("returns files, commands, rules, and next steps", () => {
    const repo = copyFixtureRepo();
    const context = prepareTaskContext(repo, "fix add test");

    expect(context.likelyFiles.length).toBeGreaterThan(0);
    expect(context.recommendedCommands.length).toBeGreaterThan(0);
    expect(context.projectRules.length).toBeGreaterThan(0);
    expect(context.nextSteps.length).toBeGreaterThan(0);
  });

  it("stores and retrieves project memory", () => {
    const repo = copyFixtureRepo();
    const stored = rememberTask(repo, {
      title: "fix add test",
      summary: "Changed add behavior and ran vitest.",
      changedFiles: ["src/main.ts"],
      tests: ["npm run test"]
    });

    expect(stored.stored).toBe(true);
    const memories = searchProjectMemory(repo, "add vitest");
    expect(memories[0]?.topic).toBe("fix add test");
  });
});

