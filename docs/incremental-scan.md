# Incremental Scan

ProjectNavigatorMCP scan is hash-aware and supports lightweight metadata refreshes plus small
file-level graph updates.

```bash
pnav scan /path/to/repo --incremental
pnav scan /path/to/repo --incremental --metadata-only
pnav scan /path/to/repo --incremental --verify-partial
pnav scan /path/to/repo --full
```

When no files changed, incremental scan skips rebuilding the index.

Incremental output includes `changePlanes`, `changePlaneCounts`, `actions`, `codeGraphStale`,
`partialGraphUpdate`, `partialGraphVersion`, affected caller expansion stats, graph-plane
`freshness`, and `conservativeFullRebuild`.

Metadata-only changes in workflow profiles, eval suites, command sources, and docs avoid a code
graph rebuild. Mixed metadata changes report `changeKind: "mixed"` and list each plane.

`--metadata-only` refreshes metadata planes even when source files are dirty. Source changes are
reported as `codeGraphStale: true` with a `codeGraphStaleReason`; their stored hashes are not
advanced, so a later normal incremental scan can still update the graph.

Source changes use partial graph invalidation v2. Up to 20 code graph paths use the normal partial
path; 21-100 paths use a batch partial path. Source deletions are invalidated in place by marking
the file deleted, clearing its outgoing graph rows, removing stale incoming references, and
reindexing affected importers/callers. More than 100 code graph paths still fall back to a
conservative full graph refresh.

Partial updates mark `coChangeGraph: "stale_until_full_scan"` and duplicate clusters as `partial`
because those secondary evidence planes are not recomputed from Git history on every source edit.
