# ProjectNavigatorMCP v0.8.6 Fresh Graph & Deep Runtime Cache Evidence

## Gates

Final gate run in this workspace:

- `npm run format:check`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 37 files / 74 tests
- `npm run build`: passed

## flutter-transfer Metadata-Only Incremental Scan

Command:

```bash
node dist/cli/index.js scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer --incremental --metadata-only
```

Evidence files:

- `flutter-transfer-scan-metadata-only.json`
- `flutter-transfer-scan-metadata-only.stderr`

Summary:

- `filesChanged`: 22
- `filesDeleted`: 0
- `changeKind`: `code_graph`
- `actions`: `mark_code_graph_stale`
- `codeGraphStale`: true
- `conservativeFullRebuild`: false
- `partialGraphUpdate`: false
- `freshness.symbolGraph`: `stale`
- `freshness.coChangeGraph`: `stale_until_full_scan`

Stale reason:

```text
22 code graph path(s) changed; skipped graph rebuild because --metadata-only was used.
```

## flutter-transfer 12-Case Strict Eval

Command:

```bash
node dist/cli/index.js eval /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer \
  --suite /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/discovery-suite.json \
  --strict \
  --metadata-only
```

Evidence files:

- `flutter-transfer-eval-metadata-only.json`
- `flutter-transfer-eval-metadata-only.stderr`

Summary:

- `caseCount`: 12
- `productionScore`: 1
- `passed`: true
- `hardFailures`: []
- `totalLatencyMs`: 3402
- `evalValidity.scoreScope`: `metadata_only`
- `indexStatus.codeGraphStale`: true

Slowest stages:

```text
entrypointsMs: 1801
handoffMs: 1263
relatedTestsMs: 140
workflowProfilesMs: 13
readOrderMs: 1
```

Runtime cache evidence:

```text
fileCatalog hits/misses: 11/1
symbolCatalog hits/misses: 11/1
routeCatalog hits/misses: 11/1
testCatalog hits/misses: 11/1
commandCatalog hits/misses: 11/1
entrypointCatalog hits/misses: 11/1
```

## Interpretation

The 12-case result is valid for repo-local workflow profile matching, workflowProtocol assertions,
mustRead direct-target policy, and recommendedCommands/gateSteps checks. Because the run used
`--metadata-only` on a dirty code graph, it is not a full fresh-symbol/import/route graph validation.
