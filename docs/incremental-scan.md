# Incremental Scan

ProjectNavigatorMCP scan is hash-aware and supports lightweight metadata refreshes plus small
file-level graph updates.

```bash
pnav scan /path/to/repo --incremental
pnav scan /path/to/repo --incremental --metadata-only
pnav scan /path/to/repo --full
```

When no files changed, incremental scan skips rebuilding the index.

Incremental output includes `changePlanes`, `changePlaneCounts`, `actions`, `codeGraphStale`,
`partialGraphUpdate`, and `conservativeFullRebuild`.

Metadata-only changes in workflow profiles, eval suites, command sources, and docs avoid a code
graph rebuild. Mixed metadata changes report `changeKind: "mixed"` and list each plane.

`--metadata-only` refreshes metadata planes even when source files are dirty. Source changes are
reported as `codeGraphStale: true` with a `codeGraphStaleReason`; their stored hashes are not
advanced, so a later normal incremental scan can still update the graph.

Small source changes use file-level graph update v1 when changed code files are at or below the
default threshold of 20 and no source files were deleted. Larger source changes and source
deletions fall back to a conservative full graph refresh.
