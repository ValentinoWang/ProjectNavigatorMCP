import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { discoverCode } from "../src/discovery/discoverCode.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

const task =
  "个人分析页截图 url-analytics-personal 应显示比赛最佳、测试最佳、训练最佳，并更新 iOS visual contract required text";

const authoritativePaths = [
  "tests/flutter-web/e2e/visual_pages_url_tree.json",
  "tests/mobile/visual_pages.yaml",
  "frontend/lib/core/qa/mobile_visual_contract.dart",
  "frontend/lib/modules/analytics/personal/personal_analytics_page.dart",
  "frontend/lib/modules/training/review/pr/pr_dashboard_page.dart",
  "frontend/lib/l10n/app_zh.arb",
  "frontend/lib/l10n/app_en.arb",
  "scripts/quality/generate_mobile_visual_contract.py",
  "scripts/quality/check_mobile_visual_required_text_guard.py"
];

function copyFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-mobile-visual-required-text-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/mobile-visual-required-text-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("mobile visual requiredText workflow", () => {
  it("treats screenshot visual contract as mobile visual acceptance instead of API contract", () => {
    const repo = copyFixture();
    const result = discoverCode(repo, task, 15);
    const profileNames = result.authoritativeHandoff.workflowProtocol.profiles.map(
      (profile) => `${profile.source}:${profile.name}`
    );
    const readOrderPaths = result.recommendedReadOrder.map((item) => item.path);
    const mustReadPaths = result.authoritativeHandoff.mustRead.map((item) => item.path);
    const actionTypes = result.authoritativeHandoff.workflowProtocol.actions.map((action) => action.type);

    expect(profileNames).toContain("built_in:mobile_visual_required_text_contract");
    expect(profileNames).not.toContain("built_in:openapi_contract_first");
    expect(readOrderPaths.slice(0, authoritativePaths.length)).toEqual(authoritativePaths);
    expect(mustReadPaths).toEqual(expect.arrayContaining(authoritativePaths.slice(0, 5)));
    expect(actionTypes).toEqual(
      expect.arrayContaining([
        "inspect_mobile_visual_screenshot_contract",
        "reverse_map_visual_url_to_flutter_source",
        "update_required_text_contract",
        "regenerate_mobile_visual_contract"
      ])
    );
    expect(readOrderPaths.indexOf("backend/tests/test_analytics_contract.py")).toBe(-1);
    expect(readOrderPaths.indexOf("frontend/packages/api_client/lib/src/model/personal_analytics.g.dart")).toBe(-1);
  });

  it("keeps capsule interpretation and Core Read Order away from backend/API noise", () => {
    const repo = copyFixture();
    const context = prepareTaskContext(repo, task, { includeMemory: false, includeDirtyStatus: false });
    const corePaths = context.coreReadOrder.map((item) => item.path);
    const recommendedCommands = context.recommendedCommands.map((command) => command.command);

    expect(context.interpretation).toContain("Mobile visual screenshot contract task");
    expect(context.interpretation).not.toContain("API contract task");
    expect(context.domain?.name).toBe("frontend_design_system");
    expect(corePaths.slice(0, authoritativePaths.length)).toEqual(authoritativePaths);
    expect(corePaths).not.toContain("backend/tests/test_analytics_contract.py");
    expect(corePaths).not.toContain("frontend/packages/api_client/lib/src/model/personal_analytics.g.dart");
    expect(recommendedCommands).toEqual([
      "python3 scripts/quality/generate_mobile_visual_contract.py",
      "python3 scripts/quality/check_mobile_visual_required_text_guard.py"
    ]);
  });
});
