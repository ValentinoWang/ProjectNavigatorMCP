import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { discoverCode } from "../src/discovery/discoverCode.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

const task =
  "通过真实 API 写入 training_row_logs / training_row_metrics，并且后端契约测试守住非法时间、row lineage、metric 绑定";

const authoritativePaths = [
  "tests/flutter-web/e2e/session-action-timing-real-api.spec.ts",
  "frontend/lib/modules/training/run/training_run_page.dart",
  "frontend/lib/modules/training/run/widgets/active_session_cockpit.dart",
  "frontend/lib/modules/training/run/training_run_controller.dart",
  "frontend/lib/modules/training/run/training_run_payload_builder.dart",
  "frontend/lib/modules/training/run/training_run_row_sync.dart",
  "backend/tests/test_training_session_action_timing_contract.py",
  "backend/app/services/training_sessions_api_delegate.py"
];

function copyFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-training-row-real-api-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/training-row-real-api-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("training row real API workflow", () => {
  it("promotes real API row-write source-of-truth files ahead of generic session and metrics noise", () => {
    const repo = copyFixture();
    const result = discoverCode(repo, task, 15);

    const protocol = result.authoritativeHandoff.workflowProtocol;
    const profileNames = protocol.profiles.map((profile) => `${profile.source}:${profile.name}`);
    const readOrderPaths = result.recommendedReadOrder.map((item) => item.path);
    const mustReadPaths = result.authoritativeHandoff.mustRead.map((item) => item.path);

    expect(profileNames).toContain("built_in:training_row_real_api_write_contract");
    expect(readOrderPaths.slice(0, authoritativePaths.length)).toEqual(authoritativePaths);
    expect(mustReadPaths).toEqual(expect.arrayContaining(authoritativePaths.slice(0, 5)));
    const sessionTemplateIndex = readOrderPaths.indexOf(
      "frontend/lib/modules/training/config/session_templates/session_template_builder_page.dart"
    );
    expect(sessionTemplateIndex === -1 || sessionTemplateIndex >= authoritativePaths.length).toBe(true);
    expect(readOrderPaths.indexOf("backend/app/api/v1/metrics_api.py")).not.toBeGreaterThanOrEqual(0);
    expect(protocol.recommendedCommands.map((command) => command.command)).toEqual([
      "make session-action-timing-real-api",
      "pytest backend/tests/test_training_session_action_timing_contract.py"
    ]);
  });

  it("keeps capsule Core Read Order on the E2E, UI, payload sync, and backend contract chain", () => {
    const repo = copyFixture();
    const context = prepareTaskContext(repo, task, { includeMemory: false, includeDirtyStatus: false });
    const corePaths = context.coreReadOrder.map((item) => item.path);
    const recommendedCommands = context.recommendedCommands.map((command) => command.command);

    expect(corePaths.slice(0, authoritativePaths.length)).toEqual(authoritativePaths);
    expect(recommendedCommands).toEqual([
      "make session-action-timing-real-api",
      "pytest backend/tests/test_training_session_action_timing_contract.py"
    ]);
    expect(context.relatedTests.commands).toEqual([]);
  });
});
