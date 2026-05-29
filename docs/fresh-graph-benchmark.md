# Fresh Graph Benchmark

Use:

```bash
pnav benchmark-fresh-graph /path/to/repo --suite .agents/pnav/discovery-suite.json --out benchmark.json
```

The benchmark reports:

- `fullScanMs`
- `noChangeIncrementalMs`
- `metadataOnlyMs`
- `smallPartialMs`
- `batchPartialMs`
- `deletePartialMs`
- `renamePartialMs`
- `freshEvalMs`
- `metadataEvalMs`
- `cacheStats`
- `slowestStages`

Unit tests assert shape and scope. Real repositories should use the output as evidence, not as a
flaky absolute timing gate.
