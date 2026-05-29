# ProjectNavigatorMCP v0.9.0 Fresh Graph Equivalence Evidence

Date: 2026-05-29

Branch: `codex/pnav-fresh-graph-runtime`

## Summary

v0.9.0 adds the first production contract for proving that partial incremental graph updates stay aligned with full scan behavior:

- graph snapshots with stable ordering
- partial-vs-full equivalence runner
- `scan --incremental --verify-partial --compare-full`
- evidence freshness policy and output fields
- strict eval v2 expected fields and hard failures
- fresh graph benchmark command
- adversarial v0.9 fixture and mutation suite

The real `flutter-transfer` metadata-only and fresh eval suites both passed with `productionScore=1` and no hard failures. Fresh eval ran with `scoreScope=full_graph` in `9721ms`, inside the initial `<10s` target.

## Fixture Equivalence

Command:

```bash
node dist/cli/index.js verify-equivalence tests/fixtures/v09-graph-adversarial-repo \
  --mutation-suite tests/fixtures/v09-graph-adversarial-repo/.agents/pnav/v09-mutations.json \
  --out agents-results/2026-05-29/pnav-v090-fresh-graph-equivalence/fixture-equivalence.json
```

Result:

- `passed: true`
- mutations passed:
  - `rename_exported_symbol`
  - `delete_source_file`
  - `route_widget_mutation`
- hard failures: `[]`

## Fixture Benchmark

Command:

```bash
node dist/cli/index.js benchmark-fresh-graph tests/fixtures/v09-graph-adversarial-repo \
  --suite /tmp/pnav-v09-benchmark-suite.json \
  --out agents-results/2026-05-29/pnav-v090-fresh-graph-equivalence/fixture-benchmark.json
```

Result:

- `fullScanMs: 80`
- `noChangeIncrementalMs: 19`
- `metadataOnlyMs: 20`
- `smallPartialMs: 32`
- `batchPartialMs: 33`
- `deletePartialMs: 51`
- `renamePartialMs: 54`
- `freshEvalMs: 16`
- `metadataEvalMs: 36`

## flutter-transfer Metadata-Only Eval

Command:

```bash
node dist/cli/index.js eval /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer \
  --suite /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/discovery-suite.json \
  --strict --metadata-only
```

Result:

- `passed: true`
- `productionScore: 1`
- `hardFailures: []`
- `totalLatencyMs: 2595`
- `evalValidity.scoreScope: metadata_only`
- `indexStatus.codeGraphStale: true`
- stale reason: `49 code graph path(s) changed; skipped graph rebuild because --metadata-only was used.`

## flutter-transfer Fresh Eval

Preparation:

```bash
node dist/cli/index.js scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer --incremental
```

Fresh scan result:

- changed code files: `49`
- update mode: `batch_partial_graph_update`
- `partialGraphVersion: 2`
- `conservativeFullRebuild: false`
- affected caller candidates: `645`
- reindexed callers: `89`
- graph freshness:
  - `symbolGraph: fresh`
  - `importGraph: fresh`
  - `routeGraph: fresh`
  - `testGraph: fresh`
  - `duplicateClusters: partial`
  - `coChangeGraph: stale_until_full_scan`

Eval command:

```bash
node dist/cli/index.js eval /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer \
  --suite /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/discovery-suite.json \
  --strict
```

Eval result:

- `passed: true`
- `productionScore: 1`
- `hardFailures: []`
- `totalLatencyMs: 9721`
- `evalValidity.scoreScope: full_graph`
- `indexStatus.codeGraphFresh: true`
- `indexStatus.codeGraphStale: false`

## Runtime Notes

The 49-file real-repo batch partial scan completed correctly without conservative rebuild, but took `172555ms` before the final token-fallback guard was tightened. The implementation now skips expensive `code_blocks.tokens_json LIKE` caller expansion for multi-file partial updates and keeps token caller matching for narrow rename/delete cases.

A final optimized no-change incremental scan on `flutter-transfer` reported:

- `filesChanged: 0`
- `durationMs: 12161`
- `actions: ["no_changes"]`

This confirms the graph does not rebuild after freshness is restored, but the large-repo file discovery/hash preflight still exceeds the aspirational `<1s` no-change target. That remains a runtime optimization target separate from v0.9.0 graph equivalence correctness.

## Local Gates

Final gates:

- `npm run format:check` passed
- `npm run typecheck` passed
- `npm test` passed, 38 files / 78 tests
- `npm run build` passed
