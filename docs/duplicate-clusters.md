# Duplicate Clusters

v0.6 persists exact normalized duplicate clusters during scan.

Tools:

- `duplicate_clusters`
- `explain_reuse`

CLI:

```bash
pnav duplicates /path/to/repo
pnav explain-reuse /path/to/repo "新增 dashboard card"
```

Clusters are deterministic and local. They use normalized code block hashes and do not require embeddings or a vector database.
