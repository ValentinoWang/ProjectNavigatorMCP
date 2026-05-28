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
