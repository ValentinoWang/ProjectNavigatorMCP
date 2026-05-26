import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { impactAnalysis } from "../src/graph/impactAnalysis.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-impact-"));
  tempDirs.push(root);
  mkdirSync(path.join(root, "src"), { recursive: true });
  mkdirSync(path.join(root, "test"), { recursive: true });
  writeFileSync(path.join(root, "src/core.ts"), "export function core() { return 1; }\n");
  writeFileSync(
    path.join(root, "src/service.ts"),
    "import { core } from './core';\nexport function service() { return core(); }\n"
  );
  writeFileSync(
    path.join(root, "src/api.ts"),
    "import { service } from './service';\nexport function api() { return service(); }\n"
  );
  writeFileSync(path.join(root, "test/api.test.ts"), "import { api } from '../src/api';\napi();\n");
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("impactAnalysis", () => {
  it("traverses graph relationships by depth and returns path chains", () => {
    const repo = makeRepo();
    scanRepo(repo);

    const depth1 = impactAnalysis(repo, "src/core.ts", 1, "both");
    expect(depth1.impactedFiles.map((file) => file.path)).toContain("src/service.ts");
    expect(depth1.impactedFiles.map((file) => file.path)).not.toContain("src/api.ts");

    const depth2 = impactAnalysis(repo, "src/core.ts", 2, "both");
    const api = depth2.impactedFiles.find((file) => file.path === "src/api.ts");
    expect(api).toBeTruthy();
    expect(api?.distance).toBe(2);
    expect(api?.pathChain.length).toBe(2);
  });
});
