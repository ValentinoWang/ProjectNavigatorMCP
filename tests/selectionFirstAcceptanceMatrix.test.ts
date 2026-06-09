import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverCode } from "../src/discovery/discoverCode.js";
import { buildSelectionFirstAcceptanceMatrix } from "../src/discovery/acceptanceManifest.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-selection-first-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/selection-first-manifest-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("selection-first visual acceptance matrix", () => {
  it("groups generated manifest variants into screen families and reverse-maps personal bests to source", () => {
    const repo = copyFixture();
    const matrix = buildSelectionFirstAcceptanceMatrix(repo);

    expect(matrix?.requiredFamilies).toBe(16);
    expect(matrix?.requiredVariants).toBe(16);

    const personalBests = matrix?.families.find((family) => family.family === "url-athlete-personal-bests");
    expect(personalBests).toMatchObject({
      normalizedRoute: "/athletes/:id/personal-bests",
      routeConstant: "AthletesRoutePaths.personalBests",
      pageWidget: "AthletePbManagePage",
      sourceFiles: ["frontend/lib/modules/athletes/detail/athlete_pb_manage_page.dart"],
      status: "mapped"
    });
    expect(personalBests?.evidenceStates).toContain("activeViewSelectionSummary");
    expect(personalBests?.missingAcceptedStates).not.toContain("activeViewSelectionSummary");
  });

  it("parses generated YAML where page fields use two spaces and selection fields use four", () => {
    const repo = copyFixture();
    const manifest = path.join(repo, "tests/mobile/visual_pages.yaml");
    const yaml = `version: 1
pages:
- id: url-athlete-personal-bests
  artifactScreenId: url-athlete-personal-bests
  role: coach
  routeTemplate: /athletes/{athleteId}/personal-bests
  selectionFirstAcceptance:
    required: true
    pageMode: singleAthleteView
    acceptedVisibleStates:
    - activeViewSelectionSummary
`;
    writeFileSync(manifest, yaml, "utf8");

    const matrix = buildSelectionFirstAcceptanceMatrix(repo);

    expect(matrix?.requiredFamilies).toBe(1);
    expect(matrix?.families[0]?.family).toBe("url-athlete-personal-bests");
    expect(matrix?.families[0]?.evidenceStates).toContain("activeViewSelectionSummary");
  });

  it("surfaces the matrix through discover_code workflow protocol and mustRead source targets", () => {
    const repo = copyFixture();
    const result = discoverCode(
      repo,
      "按 docs/developer/active-view-scope-unification-plan.md 和 tests/mobile/visual_pages.yaml 的 selectionFirstAcceptance.required 核对 url-athlete-personal-bests",
      10
    );

    const protocol = result.authoritativeHandoff.workflowProtocol;
    const matrix = protocol.acceptanceMatrices[0];

    expect(protocol.profiles.some((profile) => profile.name === "selection_first_acceptance_matrix")).toBe(true);
    expect(matrix?.requiredFamilies).toBe(16);
    expect(matrix?.families.find((family) => family.family === "url-athlete-personal-bests")?.sourceFiles).toContain(
      "frontend/lib/modules/athletes/detail/athlete_pb_manage_page.dart"
    );
    expect(result.authoritativeHandoff.mustRead.map((item) => item.path)).toEqual(
      expect.arrayContaining([
        "tests/mobile/visual_pages.yaml",
        "docs/developer/active-view-scope-unification-plan.md",
        "scripts/quality/check_mobile_visual_active_view_scope_guard.py",
        "frontend/lib/modules/athletes/detail/athlete_pb_manage_page.dart"
      ])
    );
    expect(protocol.actions.map((action) => action.type)).toContain("reverse_map_manifest_family_to_flutter_source");
  });
});
