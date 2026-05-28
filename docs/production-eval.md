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
- `maxMustRead` is exceeded.
- `suppressedWithReasons` is provided but `suppressionReasonQuality < 1`.
- `minChainCompleteness` is provided but the chain is below the requested completeness.

Case results include `hardFailures` for these strict failures.
