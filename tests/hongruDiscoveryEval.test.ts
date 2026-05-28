import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverCode } from "../src/discovery/discoverCode.js";
import type { DiscoveryResult } from "../src/discovery/types.js";
import { runDiscoveryEval } from "../src/eval/evalRunner.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

const tasks = {
  governance:
    "配置 ProjectNavigatorMCP，并按 fullstack-ai-harness.md 收尾，新增必要 Skill、docs 和 agents-results 证据。",
  roleUi: "用户截图指出学生 assessment 页面出现裸文本、无样式信息块、没有复用 Page Shell。请修复并按 Harness 收尾。",
  contract: "新增教师端班级诊断趋势接口，并在教师端 dashboard 展示趋势卡片。",
  schema: "给 reasoning_sessions 增加一个新的终态恢复字段，并让后端查询和前端终态补拉使用它。",
  appPlus: "iOS App-Plus 上 assessment 页面顶部被状态栏遮挡，H5 看起来正常，请修复。"
};

function copyHongruRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-hongru-discovery-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/hongru-discovery-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Hongru strict discovery eval", () => {
  it("locks the five highest-risk Hongru discovery failure classes", () => {
    const repo = copyHongruRepo();
    const suitePath = path.join(repo, ".pnav", "hongru-strict-discovery-suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        cases: [
          {
            id: "governance-mcp-harness-routing",
            task: tasks.governance,
            expected: {
              mustReadAny: [
                "AGENTS.md",
                "develop/Harness/fullstack-ai-harness.md",
                "develop/Harness/ai-harness-governance.md"
              ],
              mustNotRead: ["backend/app/routes/**", "frontend/uniapp-shell/src/pages/home/**"],
              maxMustRead: 5,
              profileSourcesAny: ["repo_local"],
              supportingContains: [
                "develop/Harness/quality-ai-harness.md",
                "scripts/quality/AGENTS.md",
                "docs/ai/project-navigator-mcp.md"
              ],
              actionContains: ["create_evidence_directory", "write_harness_closeout"],
              newFileExpected: ["agents-results/yyyy-mm-dd/<task>/"],
              gateStepContains: ["harness_closeout_evidence"]
            }
          },
          {
            id: "role-ui-bare-rendering-guard-escalation",
            task: tasks.roleUi,
            expected: {
              mustReadAny: [
                "frontend/uniapp-shell/AGENTS.md",
                ".agents/skills/hongru-role-ui-governance/SKILL.md",
                "develop/Harness/frontend-ai-harness.md",
                "scripts/quality/frontend_role_design_registry.json",
                "scripts/quality/run_frontend_role_design_governance_guard.sh"
              ],
              mustNotRead: ["backend/**"],
              maxMustRead: 5,
              profileSourcesAny: ["repo_local"],
              supportingContains: [
                "frontend/uniapp-shell/src/pages/assessment/index.vue",
                "frontend/uniapp-shell/src/components/global/HrRoleAwareAppShell.vue",
                "docs/design-system/governance.md"
              ],
              warningContains: ["statically detectable", "scripts/quality guard", "temporary failing counterexample"],
              actionContains: ["classify_static_detectability", "add_or_update_guard", "prove_negative_counterexample"],
              newFileExpected: ["counterexample"],
              gateStepContains: ["role_ui_counterexample_then_clean"]
            }
          },
          {
            id: "openapi-contract-first-teacher-trend",
            task: tasks.contract,
            expected: {
              mustReadAny: [
                "docs/openapi规范/openapi-main-v1-draft.yaml",
                "scripts/generate-sdk.js",
                "backend/app/routes/teacher_routes.py",
                "frontend/uniapp-shell/src/pages/teacher-home/index.vue"
              ],
              maxMustRead: 5,
              profileSourcesAny: ["repo_local"],
              readOrderContains: [
                "docs/openapi规范/openapi-main-v1-draft.yaml",
                "scripts/generate-sdk.js",
                "frontend/uniapp-shell/src/utils/sdk/generated/operations.js",
                "backend/app/routes/teacher_routes.py",
                "frontend/uniapp-shell/src/pages/teacher-home/index.vue",
                "scripts/quality/run_frontend_sdk_client_operation_guard.sh"
              ],
              orderedBefore: [
                { before: "docs/openapi规范/openapi-main-v1-draft.yaml", after: "scripts/generate-sdk.js" },
                {
                  before: "scripts/generate-sdk.js",
                  after: "frontend/uniapp-shell/src/utils/sdk/generated/operations.js"
                },
                {
                  before: "frontend/uniapp-shell/src/utils/sdk/generated/operations.js",
                  after: "backend/app/routes/teacher_routes.py"
                },
                {
                  before: "backend/app/routes/teacher_routes.py",
                  after: "frontend/uniapp-shell/src/pages/teacher-home/index.vue"
                }
              ],
              actionContains: ["create_openapi_operation", "run_sdk_generate"],
              recommendedCommandContains: ["sdk:generate", "sdk:check"],
              readOnlyContains: ["frontend/uniapp-shell/src/utils/sdk/generated"],
              gateStepContains: ["openapi_before_generated_sdk"]
            }
          },
          {
            id: "reasoning-session-schema-migration",
            task: tasks.schema,
            expected: {
              mustReadAny: [
                "backend/AGENTS.md",
                ".agents/skills/hongru-backend-schema-migration/SKILL.md",
                "develop/Harness/database-ai-harness.md",
                "backend/sql/migrations/versions/V20260529_0046__reasoning_sessions_terminal_recovery.up.sql"
              ],
              maxMustRead: 5,
              profileSourcesAny: ["repo_local"],
              supportingContains: [
                "backend/scripts/verify_migration_chain.py",
                "backend/scripts/check_schema_drift.py",
                "backend/tests/test_reasoning_sessions.py"
              ],
              actionContains: [
                "create_migration_pair",
                "run_schema_drift_check",
                "block_business_code_diagnosis_until_db_synced"
              ],
              recommendedCommandContains: ["verify_migration_chain.py", "check_schema_drift.py"],
              newFileExpected: ["backend/sql/migrations/versions"],
              gateStepContains: ["schema_migration_chain_and_drift"]
            }
          },
          {
            id: "app-plus-safe-area-parity",
            task: tasks.appPlus,
            expected: {
              mustReadAny: [
                "frontend/uniapp-shell/AGENTS.md",
                ".agents/skills/hongru-app-plus-parity/SKILL.md",
                "develop/Harness/frontend-ai-harness.md",
                "scripts/quality/run_app_plus_native_guard.sh",
                "scripts/quality/run_header_safe_area_guard.sh"
              ],
              mustNotRead: ["backend/**"],
              maxMustRead: 5,
              profileSourcesAny: ["repo_local"],
              supportingContains: [
                "scripts/qa/run_appium_app_plus_acceptance.sh",
                "frontend/uniapp-shell/src/styles/app-plus-page-parity.css",
                "frontend/uniapp-shell/src/components/global/HrRoleAwareAppShell.vue"
              ],
              actionContains: [
                "diagnose_app_plus_safe_area",
                "run_appium_app_plus_acceptance",
                "run_header_safe_area_guard"
              ],
              recommendedCommandContains: ["run_app_plus_native_guard.sh", "run_header_safe_area_guard.sh"],
              gateStepContains: ["app_plus_safe_area_acceptance"]
            }
          }
        ]
      })
    );

    const result = runDiscoveryEval(repo, suitePath, true);

    expect(result.cases.map((item) => [item.id, item.hardFailures])).toEqual([
      ["governance-mcp-harness-routing", []],
      ["role-ui-bare-rendering-guard-escalation", []],
      ["openapi-contract-first-teacher-trend", []],
      ["reasoning-session-schema-migration", []],
      ["app-plus-safe-area-parity", []]
    ]);
    expect(result.productionScore).toBeGreaterThanOrEqual(0.9);
    expect(result.passed).toBe(true);
  }, 20_000);

  it("keeps governance and UI guard tasks on governance, Harness, skills, and guards", () => {
    const repo = copyHongruRepo();
    const governance = discoverCode(repo, tasks.governance, 15);
    const roleUi = discoverCode(repo, tasks.roleUi, 15);

    expect(mustReadPaths(governance)).toContain("develop/Harness/ai-harness-governance.md");
    expect(mustReadPaths(governance)).not.toContain("backend/app/routes/business_routes.py");
    expect(mustReadPaths(governance)).not.toContain("frontend/uniapp-shell/src/pages/home/index.vue");
    expectContext(governance, "develop/Harness/quality-ai-harness.md");
    expectContext(governance, "scripts/quality/AGENTS.md");
    expectContext(governance, "docs/ai/project-navigator-mcp.md");

    expectContext(roleUi, "frontend/uniapp-shell/src/pages/assessment/index.vue");
    expectContext(roleUi, "frontend/uniapp-shell/src/components/global/HrRoleAwareAppShell.vue");
    expectContext(roleUi, "docs/design-system/governance.md");
    expect(joinedWarnings(roleUi)).toContain("statically detectable");
    expect(joinedWarnings(roleUi)).toContain("scripts/quality guard");
    expect(joinedWarnings(roleUi)).toContain("temporary failing counterexample");
    expectProfileSource(governance, "repo_local");
    expectWorkflow(governance, "actions", "create_evidence_directory");
    expectWorkflow(governance, "newFileExpectations", "agents-results/YYYY-MM-DD/<task>/");
    expectWorkflow(roleUi, "actions", "prove_negative_counterexample");
    expectWorkflow(roleUi, "gateSteps", "role_ui_counterexample_then_clean");
  }, 20_000);

  it("keeps contract, schema, and App-Plus tasks on their deterministic source-of-truth paths", () => {
    const repo = copyHongruRepo();
    const contract = discoverCode(repo, tasks.contract, 15);
    const schema = discoverCode(repo, tasks.schema, 15);
    const appPlus = discoverCode(repo, tasks.appPlus, 15);

    expectOrdered(
      contract,
      "docs/openapi规范/openapi-main-v1-draft.yaml",
      "scripts/generate-sdk.js",
      "frontend/uniapp-shell/src/utils/sdk/generated/operations.js",
      "backend/app/routes/teacher_routes.py",
      "backend/tests/test_teacher_routes.py",
      "frontend/uniapp-shell/src/pages/teacher-home/index.vue",
      "scripts/quality/run_frontend_sdk_client_operation_guard.sh"
    );
    expect(joinedWarnings(contract)).toContain("Contract-first");
    expect(joinedWarnings(contract)).toContain("do not hand-edit generated SDK files");
    expectProfileSource(contract, "repo_local");
    expectWorkflow(contract, "actions", "create_openapi_operation");
    expectWorkflow(contract, "recommendedCommands", "sdk:generate");
    expectWorkflow(contract, "editPolicies", "read_only");
    expectWorkflow(contract, "gateSteps", "openapi_before_generated_sdk");

    expectContext(schema, "backend/scripts/verify_migration_chain.py");
    expectContext(schema, "backend/scripts/check_schema_drift.py");
    expectContext(schema, "backend/app/reasoning_service.py");
    expectContext(schema, "backend/tests/test_reasoning_sessions.py");
    expect(joinedWarnings(schema)).toContain("Supabase schema that has not caught up");
    expectProfileSource(schema, "repo_local");
    expectWorkflow(schema, "actions", "create_migration_pair");
    expectWorkflow(schema, "actions", "block_business_code_diagnosis_until_db_synced");
    expectWorkflow(schema, "newFileExpectations", "migration_pair");

    expectContext(appPlus, "scripts/qa/run_appium_app_plus_acceptance.sh");
    expectContext(appPlus, "scripts/qa/app_plus_native_parity_smoke_checklist.md");
    expectContext(appPlus, "frontend/uniapp-shell/src/styles/app-plus-page-parity.css");
    expectContext(appPlus, "frontend/uniapp-shell/src/components/global/HrRoleAwareAppShell.vue");
    expect(joinedWarnings(appPlus)).toContain("HBuilderX/Appium");
    expect(joinedWarnings(appPlus)).toContain("H5 screenshots alone are insufficient");
    expectProfileSource(appPlus, "repo_local");
    expectWorkflow(appPlus, "actions", "diagnose_app_plus_safe_area");
    expectWorkflow(appPlus, "recommendedCommands", "run_header_safe_area_guard.sh");
  }, 20_000);
});

function mustReadPaths(result: DiscoveryResult): string[] {
  return result.authoritativeHandoff.mustRead.map((item) => item.path);
}

function contextPaths(result: DiscoveryResult): string[] {
  return Array.from(
    new Set([
      ...result.authoritativeHandoff.mustRead.map((item) => item.path),
      ...result.authoritativeHandoff.supportingContext.map((item) => item.path),
      ...result.recommendedReadOrder.map((item) => item.path),
      ...result.shouldInspect.map((item) => item.path),
      ...result.ignoreForNow.map((item) => item.path),
      ...result.relatedTests.testFiles
    ])
  );
}

function expectContext(result: DiscoveryResult, filePath: string): void {
  expect(contextPaths(result)).toContain(filePath);
}

function expectOrdered(result: DiscoveryResult, ...filePaths: string[]): void {
  const ordered = result.recommendedReadOrder.map((item) => item.path);
  const positions = filePaths.map((filePath) => {
    const index = ordered.indexOf(filePath);
    expect(index, `${filePath} should be in recommendedReadOrder`).toBeGreaterThanOrEqual(0);
    return index;
  });
  for (let index = 1; index < positions.length; index += 1) {
    expect(positions[index]).toBeGreaterThan(positions[index - 1]);
  }
}

function joinedWarnings(result: DiscoveryResult): string {
  return [...result.warnings, ...result.authoritativeHandoff.warnings].join("\n");
}

function expectProfileSource(result: DiscoveryResult, source: "repo_local" | "built_in"): void {
  expect(result.authoritativeHandoff.workflowProtocol.profiles.some((profile) => profile.source === source)).toBe(true);
}

function expectWorkflow(
  result: DiscoveryResult,
  key: "actions" | "recommendedCommands" | "newFileExpectations" | "editPolicies" | "gateSteps",
  needle: string
): void {
  expect(
    result.authoritativeHandoff.workflowProtocol[key].some((item) =>
      JSON.stringify(item).toLowerCase().includes(needle.toLowerCase())
    )
  ).toBe(true);
}
