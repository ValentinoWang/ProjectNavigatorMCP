# pnav v0.8.4 workflow runtime hardening evidence

Date: 2026-05-29

Target repo: `/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer`

ProjectNavigatorMCP command used:

```bash
node /Users/vsiyo/Desktop/Opensource_Tool/ProjectNavigatorMCP/dist/cli/index.js
```

## ProjectNavigatorMCP validation

```bash
npm run format:check
npm run typecheck
npm test
npm run build
```

Result:

- format check passed
- typecheck passed
- full test suite passed: 37 files, 65 tests
- build passed
- CLI version now reports `0.8.4`

## flutter-transfer scan

```bash
node dist/cli/index.js scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer --incremental
```

Result:

```json
{
  "files": 5571,
  "symbols": 33857,
  "imports": 19724,
  "routes": 439,
  "tests": 829,
  "commands": 111,
  "rules": 300,
  "documents": 64,
  "incremental": {
    "filesChanged": 21,
    "filesDeleted": 0,
    "changeKind": "code_graph",
    "conservativeFullRebuild": true,
    "durationMs": 101612
  }
}
```

The flutter-transfer working tree currently has code/doc changes outside `.agents/pnav`, so this scan correctly remained a conservative code graph rebuild. The new lightweight incremental paths are covered by ProjectNavigatorMCP fixture tests for workflow profile only, eval only, command source only, docs only, and code graph changes.

## strict production eval

```bash
node dist/cli/index.js eval /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer \
  --suite /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/discovery-suite.json \
  --strict
```

Result:

```json
{
  "productionScore": 0.999,
  "totalLatencyMs": 16822,
  "hardFailures": 0,
  "passed": true,
  "slowestStages": [
    { "stage": "handoffMs", "latencyMs": 8970 },
    { "stage": "relatedFilesMs", "latencyMs": 5229 },
    { "stage": "entrypointsMs", "latencyMs": 2440 }
  ]
}
```

All 12 cases passed. `reuseMs`, `symbolsMs`, `callGraphMs`, and `whyRelatedMs` are skipped for repo-local workflow profile tasks, which reduced the suite from roughly 50s to roughly 17s after the runtime hardening.

## 12-task command matrix

Each case was run through:

```bash
node dist/cli/index.js discover <repo> "<task>" --limit 15
node dist/cli/index.js capsule <repo> "<task>"
node dist/cli/index.js trace-feature <repo> "<task>" --limit 8
```

| Case                              | mustRead | workflowCommands | relatedCommands | trace mode | capsule includes workflow command |
| --------------------------------- | -------: | ---------------: | --------------: | ---------- | --------------------------------- |
| dashboard-training-trend-card     |        4 |                3 |               0 | workflow   | yes                               |
| workspace-microplan-scroll-sliver |        5 |                3 |               0 | workflow   | yes                               |
| identity-switch-navigation-state  |        5 |                4 |               0 | workflow   | yes                               |
| cycle-plan-builder-stepper-save   |        5 |                3 |               0 | workflow   | yes                               |
| training-summary-api-trend-slope  |        5 |                3 |               0 | workflow   | yes                               |
| data-sharing-coach-request-authz  |        5 |                3 |               0 | workflow   | yes                               |
| competition-detail-mobile-density |        5 |                2 |               0 | workflow   | yes                               |
| exercise-prescription-read-dto    |        5 |                3 |               0 | workflow   | yes                               |
| session-plan-start-time-index     |        5 |                2 |               0 | workflow   | yes                               |
| frontend-card-layout-guard-triage |        5 |                2 |               0 | workflow   | yes                               |
| auth-401-dashboard-stale-data     |        5 |                3 |               0 | workflow   | yes                               |
| role-visual-web-full-matrix-gap   |        5 |                3 |               0 | workflow   | yes                               |

Observed acceptance:

- all strict eval hard failures are gone
- all discover results keep `mustRead` within the five-file budget
- all trace-feature runs use `mode: "workflow"` and `routeToWidgetChainApplicability: "not_applicable"`
- workflow `recommendedCommands` are primary; generic command guesses are demoted to `fallbackCommands`
- every capsule includes at least one workflow command from the matched workflow profile
