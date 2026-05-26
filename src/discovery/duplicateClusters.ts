import { openProject } from "../db/project.js";

export interface DuplicateClusterMember {
  path: string;
  name: string | null;
  qualifiedName: string | null;
  similarity: number;
  reason: string | null;
}

export interface DuplicateCluster {
  id: number;
  clusterType: string;
  score: number;
  summary: string | null;
  members: DuplicateClusterMember[];
}

export function duplicateClusters(repoPath: string, scope = "", limit = 20): { clusters: DuplicateCluster[] } {
  const project = openProject(repoPath);
  try {
    const clusters = project.db
      .prepare(
        `SELECT id, cluster_type AS clusterType, score, summary
         FROM similarity_clusters
         WHERE repo_id = ?
         ORDER BY score DESC, id
         LIMIT ?`
      )
      .all(project.repo.id, limit) as Array<{ id: number; clusterType: string; score: number; summary: string | null }>;
    const memberStmt = project.db.prepare(
      `SELECT b.path, b.name, b.qualified_name AS qualifiedName, m.similarity, m.reason
       FROM similarity_members m JOIN code_blocks b ON b.id = m.block_id
       WHERE m.cluster_id = ? AND (? = '' OR b.path LIKE ? OR b.qualified_name LIKE ?)
       ORDER BY m.similarity DESC, b.path`
    );
    return {
      clusters: clusters
        .map((cluster) => ({
          ...cluster,
          members: memberStmt.all(cluster.id, scope, `%${scope}%`, `%${scope}%`) as DuplicateClusterMember[]
        }))
        .filter((cluster) => cluster.members.length > 1)
    };
  } finally {
    project.db.close();
  }
}
