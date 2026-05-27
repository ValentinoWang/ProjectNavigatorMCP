# Production Discovery Eval

`pnav eval <repo> --suite <json> --strict` runs deterministic discovery evaluation.

Each case compares `discover_code.data.authoritativeHandoff` against expected production signals:

- `mustReadAny`
- `mustNotRead`
- `chainContains`
- `reuseCandidatesAny`
- `testsAny`

The score is:

```text
production_score =
  0.22 * mustReadPrecision
+ 0.18 * mustReadCoverage
+ 0.16 * routeToWidgetChainAccuracy
+ 0.12 * reuseDecisionAccuracy
+ 0.12 * impactCriticalCoverage
+ 0.08 * noiseSuppression
+ 0.06 * explanationQuality
+ 0.06 * stabilityAndLatency
```

Strict suites pass at `production_score >= 0.90`.
