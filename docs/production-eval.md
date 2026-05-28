# Production Discovery Eval

`pnav eval <repo> --suite <json> --strict` runs deterministic discovery evaluation.

Each case compares `discover_code.data.authoritativeHandoff` against expected production signals:

- `mustReadAny`
- `mustNotRead`
- `chainContains`
- `reuseCandidatesAny`
- `testsAny`
- `suppressedWithReasons`
- `maxMustRead`
- `minChainCompleteness`
- `supportingContains`
- `readOrderContains`
- `orderedBefore`
- `warningContains`
- `actionContains`
- `recommendedCommandContains`
- `newFileExpected`
- `readOnlyContains`
- `editPolicyContains`
- `gateStepContains`
- `fallbackCommandNotContains`
- `profileSourcesAny`

The score is:

```text
production_score =
  0.22 * mustReadPrecision
+ 0.18 * mustReadCoverage
+ 0.16 * routeToWidgetChainAccuracy
+ 0.12 * reuseDecisionAccuracy
+ 0.12 * impactCriticalCoverage
+ 0.04 * noiseSuppression
+ 0.08 * suppressionReasonQuality
+ 0.02 * explanationQuality
+ 0.06 * stabilityAndLatency
```

Strict suites pass at `production_score >= 0.90`.

`suppressionReasonQuality` defaults to `1` when `suppressedWithReasons` is not specified, so existing suites remain compatible.

In strict mode, a case also fails when any hard gate is violated:

- `mustNotRead` appears in `authoritativeHandoff.mustRead`.
- Any `mustReadAny` expectation is missing from `authoritativeHandoff.mustRead`.
- `maxMustRead` is exceeded.
- `suppressedWithReasons` is provided but `suppressionReasonQuality < 1`.
- `minChainCompleteness` is provided but the chain is below the requested completeness.
- `supportingContains` or `readOrderContains` paths are missing.
- `orderedBefore` paths are missing or appear in the wrong order.
- Required warnings, workflow actions, commands, new-file expectations, read-only policies,
  gate steps, or profile sources are missing.
- Required edit policies are missing.
- A forbidden generic fallback command appears in `relatedTests.fallbackCommands`.
- A case declares `requiresFreshCodeGraph` while the eval is running against a stale metadata-only
  source graph.

Case results include `latencyBreakdown` and `hardFailures` for these strict failures. Suite
results include `totalLatencyMs`, `slowestStages`, `indexStatus`, `evalValidity`, and `cacheStats`
so production eval runs can identify expensive discovery stages and stale graph conditions.

Use `pnav eval --metadata-only` when validating workflow profile or discovery-suite changes in a
dirty worktree. It runs a metadata-only incremental preflight, reports stale source graph state in
`indexStatus`, narrows `evalValidity.scoreScope` to `metadata_only`, and does not force a code graph
rebuild. This mode is valid for profile/protocol checks, not fresh symbol graph, incoming edge, or
impact-analysis assertions.

The additional workflow assertions do not change the legacy production score. They only add
strict-mode hard failures so old suites stay compatible while production suites can verify that
the handoff is executable, not merely well ranked.
