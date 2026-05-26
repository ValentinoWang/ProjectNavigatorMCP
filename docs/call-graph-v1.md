# Call Graph V1

Call Graph V1 is deterministic and confidence-scored. It does not claim IDE-level precision.

## Edge Confidence

- `exact_local`: 0.95
- `repo_unique_name`: 0.75
- `ambiguous_name`: 0.45

## Tools

- `find_callers`
- `find_callees`
- `trace_symbol`

Edges are stored in `symbol_edges` with evidence JSON.
