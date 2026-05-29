# Partial-vs-Full Equivalence

Use:

```bash
pnav verify-equivalence /path/to/repo --mutation-suite .agents/pnav/v09-mutations.json
pnav scan /path/to/repo --incremental --verify-partial --compare-full
```

The verifier compares a partial incremental scan against a clean full scan using stable graph
snapshot keys and optional query suites.

Allowed differences are intentionally narrow:

- `coChangeGraph: stale_until_full_scan`
- duplicate or similarity evidence marked `partial`
- low-score tail ordering

Core differences in `mustRead`, callers/callees, route chains, deleted files, import bindings, or
fresh exact edges are hard failures.
