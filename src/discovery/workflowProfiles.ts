import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { matchesAnyPattern } from "../config/projectConfig.js";
import type { FileHit } from "../graph/types.js";
import {
  buildSelectionFirstAcceptanceMatrix,
  explicitAcceptanceFamiliesFromTask,
  type AcceptanceManifestMatrix
} from "./acceptanceManifest.js";
import type { DependencyTier } from "./dependencyTiers.js";
import type { StrictGateCandidate } from "./strictMustReadGate.js";

export interface WorkflowDiscoveryProfile {
  name: string;
  source: WorkflowProfileSource;
  confidence: number;
  candidates: StrictGateCandidate[];
  readOrder: FileHit[];
  suppressPaths: string[];
  warnings: string[];
  actions: WorkflowAction[];
  recommendedCommands: WorkflowCommand[];
  newFileExpectations: WorkflowNewFileExpectation[];
  editPolicies: WorkflowEditPolicy[];
  gateSteps: WorkflowGateStep[];
  acceptanceMatrices: AcceptanceManifestMatrix[];
}

export type WorkflowProfileSource = "repo_local" | "built_in";

export interface WorkflowAction {
  type: string;
  target?: string;
  path?: string;
  directory?: string;
  artifact?: string;
  command?: string;
  required: boolean;
  reason: string;
  sourceProfile: string;
  source: WorkflowProfileSource;
}

export interface WorkflowCommand {
  command: string;
  reason: string;
  required: boolean;
  sourceProfile: string;
  source: WorkflowProfileSource;
}

export interface WorkflowNewFileExpectation {
  kind: string;
  path?: string;
  directory?: string;
  pattern?: string;
  required: boolean;
  reason: string;
  sourceProfile: string;
  source: WorkflowProfileSource;
}

export interface WorkflowEditPolicy {
  path: string;
  policy: "read_only" | "create" | "inspect_only" | "do_not_touch";
  reason: string;
  sourceProfile: string;
  source: WorkflowProfileSource;
}

export interface WorkflowGateStep {
  id: string;
  description: string;
  command?: string;
  required: boolean;
  sourceProfile: string;
  source: WorkflowProfileSource;
}

export interface WorkflowProtocol {
  profiles: Array<{ name: string; source: WorkflowProfileSource; confidence: number }>;
  actions: WorkflowAction[];
  recommendedCommands: WorkflowCommand[];
  newFileExpectations: WorkflowNewFileExpectation[];
  editPolicies: WorkflowEditPolicy[];
  gateSteps: WorkflowGateStep[];
  acceptanceMatrices: AcceptanceManifestMatrix[];
}

interface SeedOptions {
  score: number;
  role: string;
  why: string;
  evidence: string[];
  tier: DependencyTier;
}

export function resolveWorkflowDiscoveryProfiles(repoPath: string, task: string): WorkflowDiscoveryProfile[] {
  const lowered = task.toLowerCase();
  const repoLocalProfiles = resolveRepoLocalWorkflowProfiles(repoPath, lowered);
  const builtInProfiles = resolveBuiltInWorkflowProfiles(repoPath, lowered);

  return applyProfileSuppressions(sortProfiles([...repoLocalProfiles, ...builtInProfiles]));
}

export function workflowSuppressesPath(profiles: WorkflowDiscoveryProfile[], filePath: string): boolean {
  return profiles.some((profile) => matchesAnyPattern(filePath, profile.suppressPaths));
}

export function isWorkflowProfileReadOrder(item: FileHit): boolean {
  return item.reason.startsWith("Workflow profile:");
}

function sortProfiles(profiles: WorkflowDiscoveryProfile[]): WorkflowDiscoveryProfile[] {
  return profiles
    .filter(
      (profile) =>
        profile.candidates.length > 0 ||
        profile.readOrder.length > 0 ||
        profile.actions.length > 0 ||
        profile.recommendedCommands.length > 0 ||
        profile.newFileExpectations.length > 0 ||
        profile.editPolicies.length > 0 ||
        profile.gateSteps.length > 0 ||
        profile.acceptanceMatrices.length > 0
    )
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
}

function applyProfileSuppressions(profiles: WorkflowDiscoveryProfile[]): WorkflowDiscoveryProfile[] {
  return profiles.map((profile, index) => {
    const suppressors = profiles.filter(
      (candidate, candidateIndex) =>
        candidateIndex !== index && candidate.confidence > profile.confidence && candidate.suppressPaths.length > 0
    );
    if (suppressors.length === 0) {
      return profile;
    }
    const isSuppressed = (filePath: string) =>
      suppressors.some((suppressor) => matchesAnyPattern(filePath, suppressor.suppressPaths));
    return {
      ...profile,
      candidates: profile.candidates.filter((candidate) => !isSuppressed(candidate.path)),
      readOrder: profile.readOrder.filter((item) => !isSuppressed(item.path))
    };
  });
}

type RepoLocalWorkflowProfileDocument = RepoLocalWorkflowProfile[] | { profiles?: RepoLocalWorkflowProfile[] };

interface RepoLocalWorkflowProfile {
  name?: string;
  match?: {
    keywords?: string[];
    any?: string[];
    all?: string[];
    regex?: string[];
  };
  confidence?: number;
  mustRead?: RepoLocalPathSeed[];
  supporting?: RepoLocalPathSeed[];
  suppressPaths?: string[];
  warnings?: string[];
  actions?: RepoLocalAction[];
  recommendedCommands?: RepoLocalCommand[];
  newFileExpectations?: RepoLocalNewFileExpectation[];
  editPolicies?: RepoLocalEditPolicy[];
  gateSteps?: RepoLocalGateStep[];
}

type RepoLocalPathSeed =
  | string
  | {
      path?: string;
      pattern?: string;
      score?: number;
      role?: string;
      why?: string;
      evidence?: string | string[];
      mustReadPolicy?: "force" | "normal";
    };

type RepoLocalAction = Omit<WorkflowAction, "sourceProfile" | "source">;
type RepoLocalCommand = Omit<WorkflowCommand, "sourceProfile" | "source">;
type RepoLocalNewFileExpectation = Omit<WorkflowNewFileExpectation, "sourceProfile" | "source">;
type RepoLocalEditPolicy = Omit<WorkflowEditPolicy, "sourceProfile" | "source">;
type RepoLocalGateStep = Omit<WorkflowGateStep, "sourceProfile" | "source">;

function resolveRepoLocalWorkflowProfiles(repoPath: string, task: string): WorkflowDiscoveryProfile[] {
  const profilePath = [".agents/pnav/workflow-profiles.json", ".pnav/workflow-profiles.json"].find((relativePath) =>
    existsSync(path.join(repoPath, relativePath))
  );
  if (!profilePath) {
    return [];
  }
  const document = readRepoLocalProfileDocument(path.join(repoPath, profilePath));
  const profiles = Array.isArray(document) ? document : (document.profiles ?? []);
  return profiles
    .filter((profile) => matchesRepoLocalProfile(task, profile.match))
    .map((profile, index) => buildRepoLocalProfile(repoPath, profile, index));
}

function readRepoLocalProfileDocument(profilePath: string): RepoLocalWorkflowProfileDocument {
  const parsed: unknown = JSON.parse(readFileSync(profilePath, "utf8"));
  if (Array.isArray(parsed)) {
    return parsed.filter(isObject) as RepoLocalWorkflowProfile[];
  }
  if (isObject(parsed) && (!("profiles" in parsed) || Array.isArray(parsed.profiles))) {
    return parsed as RepoLocalWorkflowProfileDocument;
  }
  throw new Error(`Invalid workflow profile document: ${profilePath}`);
}

function matchesRepoLocalProfile(task: string, match: RepoLocalWorkflowProfile["match"]): boolean {
  if (!match) {
    return true;
  }
  const any = match.any ?? match.keywords ?? [];
  const all = match.all ?? [];
  const regex = match.regex ?? [];
  const anyOk = any.length === 0 || any.some((needle) => task.includes(needle.toLowerCase()));
  const allOk = all.every((needle) => task.includes(needle.toLowerCase()));
  const regexOk = regex.length === 0 || regex.some((pattern) => new RegExp(pattern, "i").test(task));
  return anyOk && allOk && regexOk;
}

function buildRepoLocalProfile(
  repoPath: string,
  profile: RepoLocalWorkflowProfile,
  index: number
): WorkflowDiscoveryProfile {
  const name = profile.name ?? `repo_local_workflow_${index + 1}`;
  const builder = new ProfileBuilder(repoPath, name, profile.suppressPaths ?? [], "repo_local");
  for (const seed of profile.mustRead ?? []) {
    addRepoLocalSeed(repoPath, builder, seed, "core");
  }
  for (const seed of profile.supporting ?? []) {
    addRepoLocalSeed(repoPath, builder, seed, "supporting");
  }
  for (const action of profile.actions ?? []) {
    builder.action({
      type: action.type,
      target: action.target,
      path: action.path,
      directory: action.directory,
      artifact: action.artifact,
      command: action.command,
      required: action.required ?? true,
      reason: action.reason ?? `Required by ${name}.`
    });
  }
  for (const command of profile.recommendedCommands ?? []) {
    builder.command({
      command: command.command,
      reason: command.reason ?? `Recommended by ${name}.`,
      required: command.required ?? true
    });
  }
  for (const expectation of profile.newFileExpectations ?? []) {
    builder.newFile({
      kind: expectation.kind,
      path: expectation.path,
      directory: expectation.directory,
      pattern: expectation.pattern,
      required: expectation.required ?? true,
      reason: expectation.reason ?? `Expected by ${name}.`
    });
  }
  for (const policy of profile.editPolicies ?? []) {
    builder.editPolicy({
      path: policy.path,
      policy: policy.policy,
      reason: policy.reason ?? `Edit policy from ${name}.`
    });
  }
  for (const step of profile.gateSteps ?? []) {
    builder.gateStep({
      id: step.id,
      description: step.description,
      command: step.command,
      required: step.required ?? true
    });
  }
  return builder.profile(profile.confidence ?? 0.95, profile.warnings ?? []);
}

function addRepoLocalSeed(
  repoPath: string,
  builder: ProfileBuilder,
  seed: RepoLocalPathSeed,
  tier: "core" | "supporting"
): void {
  const normalized = typeof seed === "string" ? { path: seed } : seed;
  const score = normalized.score ?? (tier === "core" ? 0.96 : 0.86);
  const evidence = Array.isArray(normalized.evidence)
    ? normalized.evidence
    : normalized.evidence
      ? [normalized.evidence]
      : ["repo_local_profile"];
  const targets = normalized.path
    ? [normalized.path]
    : normalized.pattern
      ? expandRepoLocalPattern(repoPath, normalized.pattern)
      : [];
  for (const target of targets) {
    if (tier === "core") {
      builder.core(
        target,
        score,
        normalized.why ?? evidence[0] ?? "repo_local_profile",
        normalized.mustReadPolicy !== "normal"
      );
    } else {
      builder.context(target, score, normalized.why ?? evidence[0] ?? "repo_local_profile");
    }
  }
}

function expandRepoLocalPattern(repoPath: string, pattern: string): string[] {
  const files: string[] = [];
  walk(repoPath, (absolutePath) => {
    const relativePath = path.relative(repoPath, absolutePath).split(path.sep).join("/");
    if (globMatch(relativePath, pattern)) {
      files.push(relativePath);
    }
  });
  return files.sort((a, b) => a.localeCompare(b));
}

function resolveBuiltInWorkflowProfiles(repoPath: string, task: string): WorkflowDiscoveryProfile[] {
  return [
    governanceHarnessProfile(repoPath, task),
    roleUiGuardProfile(repoPath, task),
    mobileVisualRequiredTextProfile(repoPath, task),
    openapiContractProfile(repoPath, task),
    schemaMigrationProfile(repoPath, task),
    appPlusParityProfile(repoPath, task),
    authSessionBoundaryProfile(repoPath, task),
    trainingRowRealApiWriteProfile(repoPath, task),
    selectionFirstAcceptanceProfile(repoPath, task),
    screenshotSemanticsProfile(repoPath, task),
    reasoningSessionProfile(repoPath, task),
    qualityGateProfile(repoPath, task)
  ].filter((item): item is WorkflowDiscoveryProfile => item !== null);
}

function governanceHarnessProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (!/(projectnavigatormcp|pnav|\bmcp\b)/.test(task) || !/(harness|skill|agents-results|治理|收尾)/.test(task)) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "governance_harness", [
    "backend/app/routes/**",
    "frontend/uniapp-shell/src/pages/home/**",
    "frontend/uniapp-shell/src/pages/home-*",
    "frontend/uniapp-shell/src/pages/home-adapter*"
  ]);
  builder.core("AGENTS.md", 0.99, "root_governance");
  builder.core("develop/Harness/fullstack-ai-harness.md", 0.98, "fullstack_harness");
  builder.core("develop/Harness/ai-harness-governance.md", 0.97, "ai_harness_governance");
  builder.core(".agents/skills/hongru-project-navigator-mcp/SKILL.md", 0.95, "project_navigator_skill");
  builder.core(".mcp.json", 0.93, "mcp_config");
  builder.context("develop/Harness/quality-ai-harness.md", 0.89, "quality_harness");
  builder.context("scripts/quality/AGENTS.md", 0.87, "quality_agents");
  builder.context("docs/ai/project-navigator-mcp.md", 0.86, "project_navigator_doc");
  builder.contextMany(
    findUnder(repoPath, ".agents/skills", (file) => file.endsWith("/SKILL.md"), 8),
    0.82
  );
  builder.contextMany(
    findUnder(repoPath, "docs/ai", (file) => file.endsWith(".md"), 8),
    0.8
  );
  builder.action({
    type: "create_evidence_directory",
    directory: "agents-results/YYYY-MM-DD/<task>/",
    required: true,
    reason: "Harness closeout needs a durable evidence directory before business-code edits."
  });
  builder.action({
    type: "write_harness_closeout",
    artifact: "agents-results/YYYY-MM-DD/<task>/closeout.md",
    required: true,
    reason: "Governance work must finish with a concise harness closeout artifact."
  });
  builder.newFile({
    kind: "evidence_directory",
    directory: "agents-results/YYYY-MM-DD/<task>/",
    pattern: "agents-results/YYYY-MM-DD/<task>/*",
    required: true,
    reason: "Store command transcript, before/after validation, and handoff evidence."
  });
  builder.gateStep({
    id: "harness_closeout_evidence",
    description: "Verify the Harness closeout references the evidence directory and validation commands.",
    required: true
  });
  return builder.profile(0.96, [
    "Governance/MCP setup should stay in AGENTS, Harness docs, skills, docs/ai, .mcp.json, and evidence folders before business routes or pages."
  ]);
}

function roleUiGuardProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  const uiFailure = /(裸文本|无样式|page shell|pageshell|信息块|raw text|bare|unstyled)/.test(task);
  if (!uiFailure || !/(assessment|学生|截图|页面|修复|guard|门禁|harness|收尾)/.test(task)) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "role_ui_guard_escalation", ["backend/**"]);
  builder.core("frontend/uniapp-shell/AGENTS.md", 0.99, "frontend_agents");
  builder.core(".agents/skills/hongru-role-ui-governance/SKILL.md", 0.98, "role_ui_skill");
  builder.core("develop/Harness/frontend-ai-harness.md", 0.97, "frontend_harness");
  builder.core("scripts/quality/frontend_role_design_registry.json", 0.96, "role_design_registry");
  builder.core("scripts/quality/run_frontend_role_design_governance_guard.sh", 0.95, "role_design_guard");
  builder.context("frontend/uniapp-shell/src/pages/assessment/index.vue", 0.9, "assessment_page");
  builder.context("frontend/uniapp-shell/src/components/global/HrRoleAwareAppShell.vue", 0.88, "page_shell");
  builder.contextMany(
    findUnder(repoPath, "docs/design-system", (file) => file.endsWith(".md"), 6),
    0.84
  );
  builder.action({
    type: "classify_static_detectability",
    target: "role-ui-bare-rendering",
    required: true,
    reason: "Bare text and missing Page Shell failures must be classified before editing the page."
  });
  builder.action({
    type: "add_or_update_guard",
    path: "scripts/quality/run_frontend_role_design_governance_guard.sh",
    required: true,
    reason: "Statically detectable UI governance failures require a same-turn scripts/quality guard update."
  });
  builder.action({
    type: "prove_negative_counterexample",
    artifact: "agents-results/YYYY-MM-DD/<task>/role-ui-counterexample.md",
    required: true,
    reason: "The guard must be proven with a temporary failing counterexample before cleanup."
  });
  builder.newFile({
    kind: "counterexample_evidence",
    pattern: "agents-results/YYYY-MM-DD/<task>/*counterexample*",
    required: true,
    reason: "Record the temporary failing case and the clean rerun."
  });
  builder.gateStep({
    id: "role_ui_counterexample_then_clean",
    description: "Run the role UI guard against a temporary failing counterexample, remove it, then rerun cleanly.",
    command: "scripts/quality/run_frontend_role_design_governance_guard.sh",
    required: true
  });
  return builder.profile(0.97, [
    "Before editing UI, decide whether the bare-rendering failure is statically detectable.",
    "If it is statically detectable, add or update a scripts/quality guard in the same turn.",
    "Prove the guard with a temporary failing counterexample, then remove the counterexample and rerun the guard cleanly."
  ]);
}

function openapiContractProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (isMobileVisualRequiredTextTask(task)) {
    return null;
  }
  const contractIntent = /(接口|api|openapi|contract|契约|sdk)/.test(task);
  const teacherTrend = /(teacher|教师|班级|class|诊断|diagnostic|趋势|trend|dashboard|卡片)/.test(task);
  if (!contractIntent || !teacherTrend) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "openapi_contract_first", ["frontend/uniapp-shell/src/pages/home/**"]);
  builder.core("docs/openapi规范/openapi-main-v1-draft.yaml", 0.99, "openapi_source");
  builder.core("scripts/generate-sdk.js", 0.96, "sdk_generator");
  builder.contextMany(
    findUnder(repoPath, "frontend/uniapp-shell/src/utils/sdk/generated", () => true, 4),
    0.93
  );
  builder.core("backend/app/routes/teacher_routes.py", 0.9, "backend_teacher_route");
  builder.contextMany(
    findUnder(repoPath, "backend/tests", (file) => /teacher|diagnostic|diagnosis|trend/.test(file), 6),
    0.86
  );
  builder.core("frontend/uniapp-shell/src/pages/teacher-home/index.vue", 0.84, "teacher_dashboard_page");
  builder.contextMany(
    findUnder(repoPath, "frontend/uniapp-shell/src/pages", (file) => /teacher.*\/index\.vue$/.test(file), 8).filter(
      (file) => file !== "frontend/uniapp-shell/src/pages/teacher-home/index.vue"
    ),
    0.82
  );
  builder.contextMany(
    findUnder(repoPath, "scripts/quality", (file) => /sdk|openapi|contract/.test(file), 8),
    0.82
  );
  builder.context(".agents/skills/hongru-openapi-sdk-contract/SKILL.md", 0.8, "contract_skill");
  builder.action({
    type: "create_openapi_operation",
    path: "docs/openapi规范/openapi-main-v1-draft.yaml",
    required: true,
    reason: "New API work starts from the OpenAPI source of truth."
  });
  builder.action({
    type: "run_sdk_generate",
    command: "npm run sdk:generate",
    required: true,
    reason: "Generated SDK files must be refreshed from the OpenAPI contract."
  });
  builder.command({
    command: "npm run sdk:generate",
    required: true,
    reason: "Regenerate frontend SDK output after changing the OpenAPI draft."
  });
  builder.command({
    command: "npm run sdk:check",
    required: true,
    reason: "Verify generated SDK output matches the OpenAPI source."
  });
  builder.editPolicy({
    path: "frontend/uniapp-shell/src/utils/sdk/generated/**",
    policy: "read_only",
    reason: "Generated SDK output is updated by sdk:generate, not manual edits."
  });
  builder.gateStep({
    id: "openapi_before_generated_sdk",
    description: "Change OpenAPI before generated SDK, backend route, and frontend page work.",
    required: true
  });
  return builder.profile(0.96, [
    "Contract-first task: inspect OpenAPI before route/page code, run sdk:generate and sdk:check, and do not hand-edit generated SDK files."
  ]);
}

function schemaMigrationProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (!/(reasoning_sessions|reasoning sessions|schema|字段|migration|数据库|supabase|终态|恢复)/.test(task)) {
    return null;
  }
  if (!/(字段|schema|migration|数据库|supabase|终态|恢复)/.test(task)) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "backend_schema_migration", []);
  builder.core("backend/AGENTS.md", 0.99, "backend_agents");
  builder.core(".agents/skills/hongru-backend-schema-migration/SKILL.md", 0.98, "schema_migration_skill");
  builder.core("develop/Harness/database-ai-harness.md", 0.97, "database_harness");
  builder.coreMany(
    preferUpMigrations(
      findUnder(
        repoPath,
        "backend/sql/migrations/versions",
        (file) => {
          return /reasoning|session|recovery|terminal|final/.test(file);
        },
        8
      )
    ).slice(0, 4),
    0.95
  );
  builder.context("backend/scripts/verify_migration_chain.py", 0.92, "migration_chain_guard");
  builder.context("backend/scripts/check_schema_drift.py", 0.91, "schema_drift_guard");
  builder.coreMany(
    findUnder(repoPath, "backend/app", (file) => /reasoning|session/.test(file), 8),
    0.88
  );
  builder.contextMany(
    findUnder(repoPath, "backend/tests", (file) => /reasoning|schema|migration|drift/.test(file), 8),
    0.84
  );
  builder.action({
    type: "create_migration_pair",
    directory: "backend/sql/migrations/versions",
    required: true,
    reason: "Schema changes require the next numbered up/down migration pair."
  });
  builder.action({
    type: "run_schema_drift_check",
    command: "python backend/scripts/check_schema_drift.py",
    required: true,
    reason: "Validate that model and database schema expectations stay aligned."
  });
  builder.action({
    type: "block_business_code_diagnosis_until_db_synced",
    required: true,
    reason: "A Supabase instance missing the latest migration should not be diagnosed as business-code failure."
  });
  builder.newFile({
    kind: "migration_pair",
    directory: "backend/sql/migrations/versions",
    pattern: "backend/sql/migrations/versions/*.{up,down}.sql",
    required: true,
    reason: "Create the next up/down migration pair for the new reasoning_sessions column."
  });
  builder.command({
    command: "python backend/scripts/verify_migration_chain.py",
    required: true,
    reason: "Confirm migration ordering and paired files."
  });
  builder.command({
    command: "python backend/scripts/check_schema_drift.py",
    required: true,
    reason: "Check schema drift after the migration."
  });
  builder.gateStep({
    id: "schema_migration_chain_and_drift",
    description: "Run migration chain verification and schema drift checks before blaming app code.",
    command: "python backend/scripts/verify_migration_chain.py && python backend/scripts/check_schema_drift.py",
    required: true
  });
  return builder.profile(0.95, [
    "Schema task: migration files and schema drift checks are first-class context; a real Supabase schema that has not caught up is not automatically a business-code bug."
  ]);
}

function appPlusParityProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (isMobileVisualRequiredTextTask(task)) {
    return null;
  }
  if (!/(app-plus|app plus|ios|状态栏|safe-area|safe area|hbuilderx|appium)/.test(task)) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "app_plus_parity", ["backend/**"]);
  builder.core("frontend/uniapp-shell/AGENTS.md", 0.99, "frontend_agents");
  builder.core(".agents/skills/hongru-app-plus-parity/SKILL.md", 0.98, "app_plus_skill");
  builder.core("develop/Harness/frontend-ai-harness.md", 0.97, "frontend_harness");
  builder.core("scripts/quality/run_app_plus_native_guard.sh", 0.96, "app_plus_native_guard");
  builder.core("scripts/quality/run_header_safe_area_guard.sh", 0.95, "header_safe_area_guard");
  builder.contextMany(
    findUnder(repoPath, "scripts/qa", (file) => /appium|app_plus|app-plus|hbuilder|safe|capture/.test(file), 12),
    0.9
  );
  builder.context("frontend/uniapp-shell/src/styles/app-plus-page-parity.css", 0.88, "app_plus_css");
  builder.context("frontend/uniapp-shell/src/pages/assessment/index.vue", 0.86, "assessment_page");
  builder.context("frontend/uniapp-shell/src/components/global/HrRoleAwareAppShell.vue", 0.84, "page_shell");
  builder.action({
    type: "diagnose_app_plus_safe_area",
    target: "ios-app-plus-assessment-header",
    required: true,
    reason: "Status-bar overlap on App-Plus must be routed through native safe-area diagnostics."
  });
  builder.action({
    type: "run_appium_app_plus_acceptance",
    command: "scripts/qa/run_appium_app_plus_acceptance.sh",
    required: true,
    reason: "H5 screenshots are not sufficient evidence for an App-Plus native layout fix."
  });
  builder.action({
    type: "run_header_safe_area_guard",
    command: "scripts/quality/run_header_safe_area_guard.sh",
    required: true,
    reason: "Header safe-area regressions need a deterministic guard."
  });
  builder.command({
    command: "scripts/quality/run_app_plus_native_guard.sh",
    required: true,
    reason: "Check native App-Plus parity constraints."
  });
  builder.command({
    command: "scripts/quality/run_header_safe_area_guard.sh",
    required: true,
    reason: "Check header safe-area coverage."
  });
  builder.gateStep({
    id: "app_plus_safe_area_acceptance",
    description: "Run native App-Plus and header safe-area guards, then verify Appium acceptance evidence.",
    command: "scripts/quality/run_app_plus_native_guard.sh && scripts/quality/run_header_safe_area_guard.sh",
    required: true
  });
  return builder.profile(0.97, [
    "App-Plus parity task: include native safe-area, HBuilderX/Appium, and Page Shell context; H5 screenshots alone are insufficient."
  ]);
}

function mobileVisualRequiredTextProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (!isMobileVisualRequiredTextTask(task)) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "mobile_visual_required_text_contract", [
    "backend/**",
    "database/**",
    "infra/**",
    "shared/api/**",
    "frontend/packages/api_client/**",
    "docs/openapi*/**",
    "scripts/quality/*api*guard*",
    "**/*.g.dart"
  ]);
  builder.core("tests/flutter-web/e2e/visual_pages_url_tree.json", 0.995, "visual_url_tree_source", true);
  builder.core("tests/mobile/visual_pages.yaml", 0.99, "mobile_visual_required_text_manifest", true);
  builder.core("frontend/lib/core/qa/mobile_visual_contract.dart", 0.985, "generated_mobile_visual_contract", true);
  builder.core(
    "frontend/lib/modules/analytics/personal/personal_analytics_page.dart",
    0.98,
    "analytics_personal_page_owner",
    true
  );
  builder.core(
    "frontend/lib/modules/training/review/pr/pr_dashboard_page.dart",
    0.975,
    "personal_best_copy_widget_owner",
    true
  );
  builder.core("frontend/lib/l10n/app_zh.arb", 0.965, "i18n_required_business_copy", true);
  builder.core("frontend/lib/l10n/app_en.arb", 0.96, "i18n_required_business_copy", true);
  builder.core("scripts/quality/generate_mobile_visual_contract.py", 0.955, "mobile_visual_contract_generator", true);
  builder.core(
    "scripts/quality/check_mobile_visual_required_text_guard.py",
    0.95,
    "mobile_visual_required_text_guard",
    true
  );
  builder.context("tests/screen-shot/change_log/screenshot-revalidation-checklist.md", 0.94, "screenshot_change_log");
  builder.context("frontend/lib/core/router/app_router.dart", 0.9, "route_reverse_mapping");
  builder.action({
    type: "inspect_mobile_visual_screenshot_contract",
    target: "url-* screenshot requiredText / visual_pages manifests",
    required: true,
    reason: "Visual contract means screenshot acceptance contract here, not OpenAPI/API contract."
  });
  builder.action({
    type: "reverse_map_visual_url_to_flutter_source",
    target: "url-analytics-personal -> /analytics/personal -> PersonalAnalyticsPage -> PrDashboardPage",
    required: true,
    reason: "URL screenshot ids must be mapped through Flutter route/page/widget owners before generic keyword search."
  });
  builder.action({
    type: "update_required_text_contract",
    path: "tests/flutter-web/e2e/visual_pages_url_tree.json",
    required: true,
    reason: "Required business copy belongs in the visual URL tree before generated mobile manifests."
  });
  builder.action({
    type: "regenerate_mobile_visual_contract",
    path: "frontend/lib/core/qa/mobile_visual_contract.dart",
    command: "python3 scripts/quality/generate_mobile_visual_contract.py",
    required: true,
    reason: "Generated mobile visual contract should be refreshed from the visual_pages source."
  });
  builder.command({
    command: "python3 scripts/quality/generate_mobile_visual_contract.py",
    required: true,
    reason: "Regenerate tests/mobile/visual_pages.yaml and frontend mobile visual contract from the URL tree."
  });
  builder.command({
    command: "python3 scripts/quality/check_mobile_visual_required_text_guard.py",
    required: true,
    reason: "Verify requiredText contains the expected business copy for screenshot acceptance."
  });
  builder.editPolicy({
    path: "backend/**",
    policy: "do_not_touch",
    reason: "Screenshot requiredText copy is frontend visual acceptance work, not backend/API data work."
  });
  builder.editPolicy({
    path: "frontend/packages/api_client/**",
    policy: "read_only",
    reason: "Generated SDK models are noise for mobile visual requiredText copy."
  });
  builder.gateStep({
    id: "mobile_visual_required_text_contract",
    description:
      "Update visual URL tree requiredText, regenerate mobile visual contract artifacts, and run the requiredText guard.",
    command:
      "python3 scripts/quality/generate_mobile_visual_contract.py && python3 scripts/quality/check_mobile_visual_required_text_guard.py",
    required: true
  });
  return builder.profile(0.995, [
    "Mobile visual requiredText task: treat visual/screenshot contract as screenshot acceptance, not OpenAPI/API contract; start from visual_pages URL tree, route/page/widget owner, i18n, generated mobile visual contract, and screenshot change log."
  ]);
}

function isMobileVisualRequiredTextTask(task: string): boolean {
  const visualContract =
    /visual contract|screenshot contract|mobile visual contract|requiredtext|required text|required_text|visual_pages|screen-shot|screenshot|截图契约|视觉契约|截图验收|截图|ios/.test(
      task
    );
  const copyIntent =
    /required text|requiredtext|文案|语义|显示|比赛最佳|测试最佳|训练最佳|personal best|best badge|badge|label/.test(
      task
    );
  const urlIntent = /url-[a-z0-9-]+|\/analytics\/personal|analytics-personal|个人分析|personal analytics/.test(task);
  return visualContract && (copyIntent || urlIntent);
}

function selectionFirstAcceptanceProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (
    !/selectionfirstacceptance|selection-first|selection first|active view|active-view|visual_pages\.ya?ml|页面族|截图验收|personal-bests|personal bests/.test(
      task
    )
  ) {
    return null;
  }
  const matrix = buildSelectionFirstAcceptanceMatrix(repoPath);
  if (!matrix) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "selection_first_acceptance_matrix", [
    "backend/**",
    "database/**",
    "infra/**",
    "tests/screen-shot/**"
  ]);
  builder.acceptanceMatrix(matrix);
  builder.core(matrix.manifestPath, 0.99, "selection_first_manifest", true);
  builder.core("docs/developer/active-view-scope-unification-plan.md", 0.98, "active_view_scope_plan", true);
  builder.core("scripts/quality/check_mobile_visual_active_view_scope_guard.py", 0.97, "active_view_scope_guard", true);
  builder.context("frontend/lib/core/router/app_router.dart", 0.93, "flutter_route_reverse_mapping");
  builder.context(
    "frontend/lib/core/widgets/active_view_selection_bar.dart",
    0.9,
    "active_view_selection_summary_widget"
  );
  builder.context(
    "frontend/lib/core/widgets/active_view_scope_required_panel.dart",
    0.88,
    "athlete_selector_required_panel"
  );

  const explicitFamilies = explicitAcceptanceFamiliesFromTask(matrix, task);
  const familyTargets =
    explicitFamilies.length > 0 ? explicitFamilies : matrix.families.filter((family) => family.status !== "mapped");
  for (const family of familyTargets.slice(0, 6)) {
    for (const sourceFile of family.sourceFiles) {
      builder.core(
        sourceFile,
        explicitFamilies.length > 0 ? 0.965 : 0.91,
        `selection_first_source:${family.family}`,
        true
      );
    }
  }
  builder.action({
    type: "build_manifest_family_matrix",
    path: matrix.manifestPath,
    required: true,
    reason: `Group ${matrix.requiredVariants} required selection-first variants into ${matrix.requiredFamilies} screen families before reading page code.`
  });
  builder.action({
    type: "reverse_map_manifest_family_to_flutter_source",
    target: "selectionFirstAcceptance.required families",
    required: true,
    reason:
      "Resolve routeTemplate/artifactScreenId to Flutter route builder and page source instead of relying on generic route tokens."
  });
  builder.action({
    type: "verify_visible_state_evidence",
    target: "athleteSelector | organizationAthleteBoard | activeViewSelectionSummary",
    required: true,
    reason:
      "Each required family needs source evidence for at least one accepted visible state before screenshots are promoted."
  });
  builder.command({
    command: "python3 scripts/quality/check_mobile_visual_active_view_scope_guard.py",
    required: true,
    reason: "Run the static Active View Scope visual guard after source/contract updates."
  });
  builder.gateStep({
    id: "selection_first_manifest_to_source_matrix",
    description:
      "Confirm each selectionFirstAcceptance.required family is mapped to route/page source and has visible-state evidence.",
    command: "python3 scripts/quality/check_mobile_visual_active_view_scope_guard.py",
    required: true
  });
  return builder.profile(0.98, matrix.warnings);
}

function authSessionBoundaryProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  const boundaryIntent =
    /authsessionboundary|auth session|session lifecycle|auth state transition|auth-state-transition|principal change|unauthorized drop|logout login|login principal|session drop|auth boundary|会话边界|认证状态|登录登出|未授权丢弃/.test(
      task
    );
  const authIntent = /auth|identity|login|logout|principal|unauthorized|session|认证|身份|登录|登出|会话/.test(task);
  if (!boundaryIntent || !authIntent) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "auth_session_boundary_lifecycle", [
    "backend/**",
    "database/**",
    "infra/**",
    "tests/screen-shot/**",
    "tests/flutter-web/**",
    "frontend/lib/core/router/auth_guard.dart",
    "frontend/lib/core/navigation/primary_navigation_persona.dart",
    "frontend/lib/core/widgets/identity_capsule.dart",
    "frontend/lib/modules/design_system/components/organisms/app_bottom_nav_bar.dart",
    "frontend/test/widget/identity_capsule_test.dart",
    "frontend/test/modules/design_system/components/app_bottom_nav_bar_test.dart"
  ]);
  builder.core("frontend/lib/core/auth/auth_session_boundary.dart", 0.995, "auth_session_boundary_root", true);
  builder.core("frontend/lib/core/di/auth_controller.dart", 0.99, "auth_controller_command_boundary", true);
  builder.core("scripts/quality/check_auth_state_transition_guard.py", 0.985, "auth_state_transition_guard", true);
  builder.core("frontend/lib/core/router/router_provider.dart", 0.975, "router_auth_resync_boundary", true);
  builder.core("frontend/lib/core/identity/identity_controller.dart", 0.965, "identity_bootstrap_boundary", true);
  builder.context("frontend/lib/modules/auth/login_page.dart", 0.94, "login_redirect_boundary");
  builder.context("frontend/lib/core/router/auth_guard.dart", 0.92, "auth_route_redirect_policy");
  builder.context("frontend/lib/core/identity/identity_switch_service.dart", 0.9, "identity_switch_session_boundary");
  builder.context("frontend/lib/modules/auth/auth_repository.dart", 0.88, "auth_repository_login_logout");
  builder.context("frontend/lib/modules/auth/http_auth_api.dart", 0.86, "auth_api_login_logout");
  builder.context("frontend/test/core/di/auth_controller_race_test.dart", 0.84, "auth_controller_race_test");
  builder.context("frontend/test/core/router/auth_route_stability_test.dart", 0.83, "auth_route_stability_test");
  builder.context("frontend/test/modules/auth/login_page_first_click_test.dart", 0.82, "login_first_click_test");
  builder.action({
    type: "trace_auth_session_boundary_root",
    target: "logout | login principal change | identity switch | unauthorized session drop",
    required: true,
    reason: "Start from AuthSessionBoundary and AuthController before navigation chrome or identity display widgets."
  });
  builder.action({
    type: "verify_auth_controller_transition_hooks",
    path: "frontend/lib/core/di/auth_controller.dart",
    required: true,
    reason: "Login, logout, and syncFromTokenStore must call the session boundary at the correct transition point."
  });
  builder.action({
    type: "verify_router_uses_session_resync",
    path: "frontend/lib/core/router/router_provider.dart",
    required: true,
    reason:
      "Unauthorized or stale-token drops should resync through the auth controller instead of directly invalidating auth state."
  });
  builder.action({
    type: "verify_identity_bootstrap_boundary",
    path: "frontend/lib/core/identity/identity_controller.dart",
    required: true,
    reason: "Identity bootstrap must derive from stable auth/current-user state and not revive stale principal context."
  });
  builder.command({
    command: "make auth-state-transition-guard",
    required: true,
    reason:
      "Static guard for AuthController, RouterProvider, IdentityController, LoginPage, and auth transition regression tests."
  });
  builder.command({
    command: "make frontend-auth-stable-user-guard",
    required: true,
    reason: "Validate frontend code uses stable current-user snapshots instead of transient auth reads."
  });
  builder.command({
    command: "make identity-role-preservation-guard",
    required: true,
    reason: "Validate identity-switch behavior does not regress role/principal preservation semantics."
  });
  builder.editPolicy({
    path: "frontend/lib/core/widgets/identity_capsule.dart",
    policy: "inspect_only",
    reason: "Identity display widgets are downstream consumers; do not start a session-lifecycle root fix there."
  });
  builder.editPolicy({
    path: "frontend/lib/modules/design_system/components/organisms/app_bottom_nav_bar.dart",
    policy: "inspect_only",
    reason: "Bottom navigation reflects auth/identity state but is not the root session boundary."
  });
  builder.gateStep({
    id: "auth_session_transition_guard",
    description:
      "Run auth-state-transition-guard after inspecting AuthSessionBoundary, AuthController, RouterProvider, IdentityController, and LoginPage.",
    command: "make auth-state-transition-guard",
    required: true
  });
  return builder.profile(0.99, [
    "Auth session lifecycle task: prioritize AuthSessionBoundary/AuthController/auth-state-transition guard over identity display or bottom navigation files."
  ]);
}

function trainingRowRealApiWriteProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  const rowWriteIntent =
    /training[_ -]?row[_ -]?(logs|metrics)|training row|row lineage|row_lineage|metric binding|metric_binding|action timing|session-action-timing|非法时间|非法时长|invalid time|illegal time/.test(
      task
    );
  const realApiContractIntent =
    /真实\s*api|real api|写入|落盘|persist|后端契约|contract|契约|lineage|binding|绑定/.test(task);
  const trainingIntent = /training|训练|session|row|metric|指标/.test(task);
  if (!rowWriteIntent || !realApiContractIntent || !trainingIntent) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "training_row_real_api_write_contract", [
    "frontend/lib/modules/training/config/session_templates/**",
    "frontend/lib/modules/training/config/metrics/**",
    "frontend/lib/core/router/**",
    "frontend/packages/api_client/**",
    "backend/app/api/v1/metrics*.py",
    "backend/app/api/metrics*.py",
    "backend/generated/**",
    "scripts/quality/*api*guard*"
  ]);
  builder.core(
    "tests/flutter-web/e2e/session-action-timing-real-api.spec.ts",
    0.995,
    "real_api_e2e_primary_evidence",
    true
  );
  builder.core("frontend/lib/modules/training/run/training_run_page.dart", 0.99, "training_run_ui_entry", true);
  builder.core(
    "frontend/lib/modules/training/run/widgets/active_session_cockpit.dart",
    0.985,
    "active_session_action_source",
    true
  );
  builder.core(
    "frontend/lib/modules/training/run/training_run_controller.dart",
    0.98,
    "frontend_persistence_command",
    true
  );
  builder.core(
    "frontend/lib/modules/training/run/training_run_payload_builder.dart",
    0.975,
    "training_row_payload_source",
    true
  );
  builder.core(
    "frontend/lib/modules/training/run/training_run_row_sync.dart",
    0.97,
    "training_row_real_api_sync",
    true
  );
  builder.core(
    "backend/tests/test_training_session_action_timing_contract.py",
    0.965,
    "backend_action_timing_contract",
    true
  );
  builder.core(
    "backend/app/services/training_sessions_api_delegate.py",
    0.96,
    "backend_training_row_write_delegate",
    true
  );
  builder.action({
    type: "trace_real_api_e2e_to_row_persistence",
    path: "tests/flutter-web/e2e/session-action-timing-real-api.spec.ts",
    required: true,
    reason: "Start from the real API E2E evidence before generic session/template/metric files."
  });
  builder.action({
    type: "inspect_ui_action_to_payload_sync_chain",
    target: "TrainingRunPage -> ActiveSessionCockpit -> TrainingRunController -> payload_builder -> row_sync",
    required: true,
    reason: "The frontend source of truth is the action pipeline that persists row logs and metrics."
  });
  builder.action({
    type: "verify_backend_row_contracts",
    path: "backend/tests/test_training_session_action_timing_contract.py",
    required: true,
    reason: "Illegal time, row lineage, and metric binding must be guarded by backend contract tests."
  });
  builder.command({
    command: "make session-action-timing-real-api",
    required: true,
    reason: "Run the real API E2E that proves training_row_logs and training_row_metrics are written."
  });
  builder.command({
    command: "pytest backend/tests/test_training_session_action_timing_contract.py",
    required: true,
    reason: "Run backend contract coverage for illegal time, row lineage, and metric binding."
  });
  builder.editPolicy({
    path: "frontend/lib/modules/training/config/session_templates/**",
    policy: "inspect_only",
    reason: "Session template builders are keyword-adjacent but not the row persistence source of truth."
  });
  builder.editPolicy({
    path: "frontend/packages/api_client/**",
    policy: "read_only",
    reason: "Generated API client symbols should not drive this real API row-write diagnosis."
  });
  builder.gateStep({
    id: "training_row_real_api_contract",
    description:
      "Verify real API E2E evidence and backend contract tests before broad session/template/metric API exploration.",
    command:
      "make session-action-timing-real-api && pytest backend/tests/test_training_session_action_timing_contract.py",
    required: true
  });
  return builder.profile(0.99, [
    "Training row real API task: prioritize E2E evidence, TrainingRun action pipeline, payload/sync code, backend contract test, and write delegate over generic session/template/metric/API keyword hits."
  ]);
}

function screenshotSemanticsProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (
    !/(截图矩阵|screenshot matrix|raw i18n|\[object object\]|语义|semantics|appium|webview|auth preflight)/.test(task)
  ) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "screenshot_semantics", ["backend/app/routes/**"]);
  builder.core(".agents/skills/hongru-screenshot-visual-acceptance/SKILL.md", 0.98, "screenshot_skill");
  builder.core("scripts/qa/AGENTS.md", 0.97, "qa_agents");
  builder.core("scripts/qa/uniapp_global_pages.json", 0.96, "global_pages");
  builder.core("scripts/qa/check_appium_screenshot_semantics.py", 0.95, "screenshot_semantics_guard");
  builder.core("scripts/quality/run_frontend_vue_i18n_guard.sh", 0.94, "i18n_guard");
  builder.context("scripts/quality/run_frontend_error_normalization_guard.sh", 0.93, "error_normalization_guard");
  builder.contextMany(
    findUnder(repoPath, "tests/screen-shot", () => true, 10),
    0.86
  );
  return builder.profile(0.94, [
    "Screenshot PASS is not enough for semantic validity; separate Appium/WebView/auth preflight failures from raw i18n or object-rendering page failures."
  ]);
}

function reasoningSessionProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (/(字段|schema|migration|数据库|supabase)/.test(task)) {
    return null;
  }
  const sessionIntent = /(reasoning session|reasoningsession|\bsse\b|\bphase6\b|补拉|图谱|\bgraph\b)/.test(task);
  if (!sessionIntent) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "reasoning_session_first", []);
  builder.core("AGENTS.md", 0.99, "root_reasoning_session_first");
  builder.core("docs/openapi规范/openapi-main-v1-draft.yaml", 0.97, "openapi_source");
  builder.coreMany(
    findUnder(repoPath, "backend/app", (file) => /reasoning/.test(file), 8),
    0.94
  );
  builder.coreMany(
    findUnder(repoPath, "backend/app/routes", (file) => /reasoning/.test(file), 4),
    0.92
  );
  builder.contextMany(
    findUnder(repoPath, "frontend/uniapp-shell/src/pages/study", () => true, 6),
    0.88
  );
  builder.contextMany(
    findUnder(
      repoPath,
      "frontend/uniapp-shell/src/utils/sdk",
      (file) => /stream|reasoning|learning|generated/.test(file),
      8
    ),
    0.86
  );
  builder.contextMany(
    findUnder(repoPath, "backend/tests", (file) => /reasoning/.test(file), 8),
    0.84
  );
  builder.contextMany(
    findUnder(repoPath, "scripts/quality", (file) => /sdk|contract|openapi/.test(file), 6),
    0.8
  );
  return builder.profile(0.93, [
    "Reasoning Session First: verify six-phase event order and final envelope, graph, and diagnosis contracts before treating this as a frontend-only page issue."
  ]);
}

function qualityGateProfile(repoPath: string, task: string): WorkflowDiscoveryProfile | null {
  if (!/(pre-commit|files were modified by this hook|no-verify|hook|commit|quality gate|门禁)/.test(task)) {
    return null;
  }
  const builder = new ProfileBuilder(repoPath, "quality_gate_triage", []);
  builder.core("scripts/quality/AGENTS.md", 0.99, "quality_agents");
  builder.core(".agents/skills/hongru-quality-gate-triage/SKILL.md", 0.98, "quality_gate_skill");
  builder.core("AGENTS.md", 0.96, "root_quality_gate_discipline");
  return builder.profile(0.91, [
    "Quality gate triage: stage hook modifications and rerun; do not use --no-verify. After more than three consecutive failures, stop and write a failure summary."
  ]);
}

class ProfileBuilder {
  private readonly candidates: StrictGateCandidate[] = [];
  private readonly readOrder: FileHit[] = [];
  private readonly actions: WorkflowAction[] = [];
  private readonly recommendedCommands: WorkflowCommand[] = [];
  private readonly newFileExpectations: WorkflowNewFileExpectation[] = [];
  private readonly editPolicies: WorkflowEditPolicy[] = [];
  private readonly gateSteps: WorkflowGateStep[] = [];
  private readonly acceptanceMatrices: AcceptanceManifestMatrix[] = [];

  constructor(
    private readonly repoPath: string,
    private readonly name: string,
    private readonly suppressPaths: string[],
    private readonly source: WorkflowProfileSource = "built_in"
  ) {}

  core(filePath: string, score: number, evidence: string, forceMustRead = false): void {
    this.add(filePath, {
      score,
      role: this.name,
      why: evidence,
      evidence: ["workflow_profile", "direct_target", ...(forceMustRead ? ["workflow_force_must_read"] : []), evidence],
      tier: "core_implementation"
    });
  }

  coreMany(filePaths: string[], score: number): void {
    for (const [index, filePath] of filePaths.entries()) {
      this.core(filePath, Math.max(0.72, score - index * 0.01), "workflow_core_match");
    }
  }

  context(filePath: string, score: number, evidence: string): void {
    this.add(filePath, {
      score,
      role: `${this.name}_context`,
      why: evidence,
      evidence: ["workflow_profile", evidence],
      tier: "supporting_dependency"
    });
  }

  contextMany(filePaths: string[], score: number): void {
    for (const [index, filePath] of filePaths.entries()) {
      this.context(filePath, Math.max(0.55, score - index * 0.01), "workflow_context_match");
    }
  }

  action(input: Omit<WorkflowAction, "sourceProfile" | "source">): void {
    this.actions.push({ ...input, sourceProfile: this.name, source: this.source });
  }

  command(input: Omit<WorkflowCommand, "sourceProfile" | "source">): void {
    this.recommendedCommands.push({ ...input, sourceProfile: this.name, source: this.source });
  }

  newFile(input: Omit<WorkflowNewFileExpectation, "sourceProfile" | "source">): void {
    this.newFileExpectations.push({ ...input, sourceProfile: this.name, source: this.source });
  }

  editPolicy(input: Omit<WorkflowEditPolicy, "sourceProfile" | "source">): void {
    this.editPolicies.push({ ...input, sourceProfile: this.name, source: this.source });
  }

  gateStep(input: Omit<WorkflowGateStep, "sourceProfile" | "source">): void {
    this.gateSteps.push({ ...input, sourceProfile: this.name, source: this.source });
  }

  acceptanceMatrix(matrix: AcceptanceManifestMatrix): void {
    this.acceptanceMatrices.push(matrix);
  }

  profile(confidence: number, warnings: string[]): WorkflowDiscoveryProfile {
    const dedupedCandidates = dedupeCandidates(this.candidates);
    return {
      name: this.name,
      source: this.source,
      confidence,
      candidates: dedupedCandidates,
      readOrder: dedupeReadOrder(this.readOrder),
      suppressPaths: this.suppressPaths,
      warnings,
      actions: dedupeWorkflowItems(this.actions, actionKey),
      recommendedCommands: dedupeWorkflowItems(this.recommendedCommands, (item) => item.command),
      newFileExpectations: dedupeWorkflowItems(this.newFileExpectations, newFileKey),
      editPolicies: dedupeWorkflowItems(this.editPolicies, (item) => `${item.policy}:${item.path}`),
      gateSteps: dedupeWorkflowItems(this.gateSteps, (item) => item.id),
      acceptanceMatrices: this.acceptanceMatrices
    };
  }

  private add(filePath: string, options: SeedOptions): void {
    if (!existsSync(path.join(this.repoPath, filePath))) {
      return;
    }
    this.candidates.push({
      path: filePath,
      score: options.score,
      role: options.role,
      why: `Workflow profile: ${options.why}`,
      evidence: options.evidence,
      tier: options.tier
    });
    this.readOrder.push({
      path: filePath,
      score: options.score,
      reason: `Workflow profile: ${options.why}`
    });
  }
}

function findUnder(
  repoPath: string,
  relativeDir: string,
  predicate: (relativePath: string) => boolean,
  limit: number
): string[] {
  const root = path.join(repoPath, relativeDir);
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  walk(root, (absolutePath) => {
    const relativePath = path.relative(repoPath, absolutePath).split(path.sep).join("/");
    if (predicate(relativePath)) {
      files.push(relativePath);
    }
  });
  return files.sort((a, b) => a.localeCompare(b)).slice(0, limit);
}

function walk(current: string, visit: (absolutePath: string) => void): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (ignoredProfileDir(entry.name)) {
        continue;
      }
      walk(absolutePath, visit);
    } else if (entry.isFile() && !ignoredProfileFile(entry.name) && statSync(absolutePath).size <= 1_500_000) {
      visit(absolutePath);
    }
  }
}

function ignoredProfileDir(name: string): boolean {
  return new Set([".git", ".pnav", "node_modules", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"]).has(
    name
  );
}

function ignoredProfileFile(name: string): boolean {
  return name === ".DS_Store" || /\.(pyc|pyo|png|jpg|jpeg|gif|webp)$/i.test(name);
}

function dedupeCandidates(items: StrictGateCandidate[]): StrictGateCandidate[] {
  const best = new Map<string, StrictGateCandidate>();
  for (const item of items) {
    const existing = best.get(item.path);
    if (!existing || item.score > existing.score) {
      best.set(item.path, item);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function dedupeReadOrder(items: FileHit[]): FileHit[] {
  const best = new Map<string, FileHit>();
  for (const item of items) {
    const existing = best.get(item.path);
    if (!existing || item.score > existing.score) {
      best.set(item.path, item);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function preferUpMigrations(filePaths: string[]): string[] {
  return [...filePaths].sort((a, b) => {
    const upDelta = Number(b.endsWith(".up.sql")) - Number(a.endsWith(".up.sql"));
    return upDelta || a.localeCompare(b);
  });
}

function dedupeWorkflowItems<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(item);
    }
  }
  return output;
}

function actionKey(item: WorkflowAction): string {
  return `${item.type}:${item.target ?? ""}:${item.path ?? ""}:${item.directory ?? ""}:${item.command ?? ""}`;
}

function newFileKey(item: WorkflowNewFileExpectation): string {
  return `${item.kind}:${item.path ?? ""}:${item.directory ?? ""}:${item.pattern ?? ""}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function globMatch(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(value);
}
