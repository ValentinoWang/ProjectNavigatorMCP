# flutter-transfer Demo Queries

This file defines real acceptance scenarios for ProjectNavigatorMCP.

Target repository:

```text
/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

Project-local database:

```text
/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.pnav/project.sqlite
```

The path above is only a demo target. Implementation code must accept any repository path
passed through CLI arguments.

## Setup

Expected commands:

```bash
pnav init /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
pnav scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer --incremental
pnav scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer --incremental --metadata-only
pnav map /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

## Demo 1: Workspace Microplan Scroll Issue

Command:

```bash
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "修复 workspace microplan 页面滚动问题"
```

Expected result should mention:

- `frontend/lib/modules/workspace/**`
- `frontend/lib/core/router/app_router.dart`
- `frontend/test/integration/workspace_microplan_*.dart`
- `make workspace-microplan-scroll-guard`
- `make flutter-sliver-contract-guard`
- responsive width checks: `360 / 390 / 768 / 1024 / 1280 / 1440`

Expected risks should mention:

- nested scroll / sliver constraint risk
- responsive layout risk
- do not weaken guard tests

## Demo 2: Auth and Identity Switching

Command:

```bash
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "修改登录身份切换逻辑"
```

Expected result should mention:

- `frontend/lib/core/identity/**`
- `frontend/lib/core/di/**`
- `frontend/lib/modules/auth/**`
- identity-related tests under `frontend/test/core/identity/`
- auth-related tests under `frontend/test/core/di/` and `frontend/test/unit/test_auth.dart`
- `make frontend-auth-stable-user-guard`
- `make frontend-analyze`

Expected risks should mention:

- athlete / coach / admin / personal workspace identity differences
- stable-user assumptions
- auth bootstrap behavior

## Demo 3: Session Plan API Field Change

Command:

```bash
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "调整 session plan 接口字段"
```

Expected result should mention:

- `backend/app/api/v1/session_plans.py`
- `backend/app/services/session_plan_service.py`
- `backend/app/schemas/session_plan.py`
- `backend/repositories/session_plan_repository.py`
- `shared/api/openapi.json`
- `frontend/packages/api_client/**`
- `make fetch-openapi`
- `make gen-sdk`
- `make openapi-sdk-drift-guard`

Expected warnings:

- Do not edit `shared/api/openapi.json` by hand.
- Do not patch generated Dart SDK files manually.
- If backend contract changes, update the generation chain first.

## Demo 4: Production Discovery Gate

Command:

```bash
pnav discover /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "新增 athlete dashboard training trend card" --limit 15
```

Expected result should include:

- `authoritativeHandoff.mustRead` capped at five files.
- `authoritativeHandoff.chainCompleteness` no higher than the evidence supports; `route_test_covered` requires related tests.
- `authoritativeHandoff.testCoverage.coverageStrength` should be `strong` before `route_test_covered` is trusted.
- `authoritativeHandoff.supportingContext` and `suppressedCandidates` with precise reasons for support dependencies and artifacts.
- `authoritativeHandoff.reuseDecision.affectedCallers` when a reusable component has symbol-graph callers.
- `authoritativeHandoff.workflowProtocol` when the target repo defines `.agents/pnav/workflow-profiles.json`
  or `.pnav/workflow-profiles.json`.
- `relatedTests.commands` should stay empty and `relatedTests.fallbackCommands` should hold generic guard/test
  guesses when workflow `recommendedCommands` exist.
- no backend, screenshot, QA, E2E, logger, l10n, or API-error wrapper files in `mustRead` unless explicitly requested.

## Demo 5: Workflow Runtime Hardening Eval

Command:

```bash
pnav eval /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer \
  --suite /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/discovery-suite.json \
  --strict \
  --metadata-only
```

Expected result should include:

- `productionScore >= 0.99`
- every case has `hardFailures: []`
- every case has `latencyBreakdown`
- top-level `slowestStages`
- top-level `indexStatus` and `cacheStats`
- mixed dirty worktrees can report `indexStatus.codeGraphStale: true` without forcing a full rebuild
- workflow protocol assertions for commands, edit policies, gate steps, and profile provenance

For each task in the suite, also run:

```bash
pnav discover /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "<task>" --limit 15
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "<task>"
pnav trace-feature /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "<task>" --limit 8
```

Expected trace behavior:

- route/page/widget tasks may use `mode: "route"`
- OpenAPI, DB migration, guard triage, and visual matrix tasks should use `mode: "workflow"`
- workflow traces should expose `workflowProtocol`, `workflowChain`, and `routeToWidgetChainApplicability`

## Demo 6: Memory Loop

After completing Demo 1, call `remember_task` through MCP or an equivalent future CLI.

Example memory:

```json
{
  "title": "修复 workspace microplan 页面滚动问题",
  "summary": "Root cause was nested scroll constraint mismatch in the workspace microplan page.",
  "changed_files": ["frontend/lib/modules/workspace/pages/microplan_page.dart"],
  "tests": ["make workspace-microplan-scroll-guard", "make flutter-sliver-contract-guard"],
  "tags": ["flutter", "workspace", "scroll"]
}
```

Then rerun:

```bash
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "workspace microplan 滚动又有问题"
```

Expected result should include the prior memory hit.
