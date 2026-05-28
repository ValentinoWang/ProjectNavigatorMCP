# ProjectNavigatorMCP v0.8.5 Incremental Runtime Evidence

## Scope

- Branch: `codex/pnav-incremental-eval-runtime`
- Version target: `0.8.5`
- Target repo: `/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer`
- Goal: validate metadata-only incremental scan, stale code graph reporting, and 12-case strict eval without forcing a full graph rebuild in a dirty worktree.

## Local Gates

- `npm run format:check`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 37 files / 71 tests
- `npm run build`: passed

## flutter-transfer Metadata-Only Scan

Command:

```bash
node dist/cli/index.js scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer --incremental --metadata-only
```

Summary:

```json
{
  "files": 5571,
  "symbols": 33857,
  "routes": 439,
  "tests": 829,
  "commands": 111,
  "incremental": {
    "filesChanged": 19,
    "filesDeleted": 0,
    "changeKind": "mixed",
    "changePlaneCounts": {
      "workflowProfiles": 0,
      "evalSuites": 1,
      "commandSources": 0,
      "docs": 1,
      "codeGraph": 17,
      "deleted": 0
    },
    "actions": ["refresh_eval_suites", "rescan_rules_documents", "mark_code_graph_stale"],
    "codeGraphStale": true,
    "codeGraphStaleReason": "17 code graph path(s) changed; skipped graph rebuild because --metadata-only was used.",
    "conservativeFullRebuild": false,
    "partialGraphUpdate": false,
    "durationMs": 6198
  }
}
```

Result: mixed dirty checkout did not trigger conservative full rebuild under `--metadata-only`.

## flutter-transfer Strict Eval

Command:

```bash
node dist/cli/index.js eval /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer \
  --suite /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/discovery-suite.json \
  --strict \
  --metadata-only
```

Summary:

```json
{
  "productionScore": 1,
  "totalLatencyMs": 7328,
  "passed": true,
  "caseCount": 12,
  "hardFailures": [],
  "indexStatus": {
    "codeGraphStale": true,
    "codeGraphStaleReason": "17 code graph path(s) changed; skipped graph rebuild because --metadata-only was used.",
    "conservativeFullRebuild": false
  },
  "slowestStages": [
    { "stage": "handoffMs", "latencyMs": 3592 },
    { "stage": "relatedFilesMs", "latencyMs": 2853 },
    { "stage": "entrypointsMs", "latencyMs": 823 }
  ],
  "cacheStats": {
    "entrypointCatalog": { "hits": 11, "misses": 1 }
  }
}
```

Result: 12/12 strict eval passed with stale code graph surfaced as non-fatal metadata-only status.
