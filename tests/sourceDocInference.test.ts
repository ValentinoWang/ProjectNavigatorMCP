import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSourceDoc } from "../src/docs/sourceDocQuery.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("source doc infer mode", () => {
  it("extracts paths and commands from non-frontmatter docs with lower confidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pnav-source-infer-"));
    tempDirs.push(root);
    cpSync(path.resolve("tests/fixtures/no-frontmatter-source-doc-repo"), root, { recursive: true });

    scanRepo(root);
    const doc = loadSourceDoc(root, "docs/implementation-plan.md").doc;

    expect(doc?.parseMode).toBe("inferred");
    expect(doc?.docConfidence).toBeLessThan(0.7);
    expect(doc?.sourceWarnings.length).toBeGreaterThan(0);
    expect(doc?.targets.map((target) => target.targetPath)).toContain(
      "frontend/lib/modules/design_system/theme/experience_theme.dart"
    );
    expect(doc?.steps.map((step) => step.command)).toContain("make frontend-design-system-usage-guard");
  });
});
