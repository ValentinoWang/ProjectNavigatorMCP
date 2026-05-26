# Discovery Chain

A discovery chain is the shortest explanation path from a feature request to relevant code.

Typical chain:

```text
entrypoint -> implementation -> reuse candidate -> test
```

Use:

```bash
pnav trace-feature /path/to/repo "新增 athlete dashboard trend card"
```

MCP:

```text
trace_feature
```

Each chain includes confidence and evidence for every step.
