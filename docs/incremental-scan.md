# Incremental Scan

v0.6 adds hash-aware scan reporting.

```bash
pnav scan /path/to/repo --incremental
pnav scan /path/to/repo --full
```

When no files changed, incremental scan skips rebuilding the index.

When files changed, v0.6 reports changed/skipped/deleted counts and uses a conservative full graph refresh so derived edges, code blocks, and duplicate clusters stay consistent. Future versions can replace this conservative refresh with true per-file invalidation.
