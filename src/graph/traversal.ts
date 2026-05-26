import type { ProjectDatabase } from "../db/connection.js";

export type NodeType = "file" | "symbol";
export type TraversalDirection = "upstream" | "downstream" | "both";

export interface TraversalOptions {
  seedType: NodeType;
  seedId: number;
  direction: TraversalDirection;
  maxDepth: number;
  maxResults: number;
}

export interface RelationshipStep {
  kind: string;
  from: string;
  to: string;
}

export interface TraversalHit {
  nodeType: NodeType;
  nodeId: number;
  path?: string;
  name?: string;
  distance: number;
  score: number;
  confidence: number;
  relationshipPath: RelationshipStep[];
}

interface EdgeRow {
  from_type: NodeType;
  from_id: number;
  to_type: NodeType;
  to_id: number;
  kind: string;
  weight: number;
  confidence: number;
}

interface QueueItem {
  nodeType: NodeType;
  nodeId: number;
  distance: number;
  score: number;
  confidence: number;
  relationshipPath: RelationshipStep[];
}

export function traverseGraph(db: ProjectDatabase, repoId: number, options: TraversalOptions): TraversalHit[] {
  const queue: QueueItem[] = [
    {
      nodeType: options.seedType,
      nodeId: options.seedId,
      distance: 0,
      score: 1,
      confidence: 1,
      relationshipPath: []
    }
  ];
  const visited = new Set<string>([nodeKey(options.seedType, options.seedId)]);
  const hits: TraversalHit[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    if (current.distance >= options.maxDepth) {
      continue;
    }
    const edges = loadEdges(db, repoId, current.nodeType, current.nodeId, options.direction);
    for (const edge of edges) {
      const nextType =
        edge.from_type === current.nodeType && edge.from_id === current.nodeId ? edge.to_type : edge.from_type;
      const nextId = edge.from_type === current.nodeType && edge.from_id === current.nodeId ? edge.to_id : edge.from_id;
      const key = nodeKey(nextType, nextId);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      const fromLabel = labelNode(db, edge.from_type, edge.from_id);
      const toLabel = labelNode(db, edge.to_type, edge.to_id);
      const distance = current.distance + 1;
      const score = current.score * relationshipWeight(edge.kind) * Math.min(2, edge.weight);
      const confidence = current.confidence * edge.confidence;
      const item: QueueItem = {
        nodeType: nextType,
        nodeId: nextId,
        distance,
        score,
        confidence,
        relationshipPath: [
          ...current.relationshipPath,
          {
            kind: edge.kind,
            from: fromLabel,
            to: toLabel
          }
        ]
      };
      const decorated = decorateHit(db, item);
      if (decorated) {
        hits.push(decorated);
      }
      queue.push(item);
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.distance - b.distance).slice(0, options.maxResults);
}

function loadEdges(
  db: ProjectDatabase,
  repoId: number,
  nodeType: NodeType,
  nodeId: number,
  direction: TraversalDirection
): EdgeRow[] {
  if (direction === "downstream") {
    return db
      .prepare(
        "SELECT from_type, from_id, to_type, to_id, kind, weight, confidence FROM edges WHERE repo_id = ? AND from_type = ? AND from_id = ?"
      )
      .all(repoId, nodeType, nodeId) as EdgeRow[];
  }
  if (direction === "upstream") {
    return db
      .prepare(
        "SELECT from_type, from_id, to_type, to_id, kind, weight, confidence FROM edges WHERE repo_id = ? AND to_type = ? AND to_id = ?"
      )
      .all(repoId, nodeType, nodeId) as EdgeRow[];
  }
  return db
    .prepare(
      `SELECT from_type, from_id, to_type, to_id, kind, weight, confidence
       FROM edges
       WHERE repo_id = ? AND ((from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?))`
    )
    .all(repoId, nodeType, nodeId, nodeType, nodeId) as EdgeRow[];
}

function decorateHit(db: ProjectDatabase, item: QueueItem): TraversalHit | null {
  if (item.nodeType === "file") {
    const row = db.prepare("SELECT path FROM files WHERE id = ?").get(item.nodeId) as { path: string } | undefined;
    if (!row) {
      return null;
    }
    return {
      nodeType: "file",
      nodeId: item.nodeId,
      path: row.path,
      distance: item.distance,
      score: item.score,
      confidence: item.confidence,
      relationshipPath: item.relationshipPath
    };
  }
  const row = db.prepare("SELECT name FROM symbols WHERE id = ?").get(item.nodeId) as { name: string } | undefined;
  if (!row) {
    return null;
  }
  return {
    nodeType: "symbol",
    nodeId: item.nodeId,
    name: row.name,
    distance: item.distance,
    score: item.score,
    confidence: item.confidence,
    relationshipPath: item.relationshipPath
  };
}

function labelNode(db: ProjectDatabase, nodeType: NodeType, nodeId: number): string {
  if (nodeType === "file") {
    const row = db.prepare("SELECT path FROM files WHERE id = ?").get(nodeId) as { path: string } | undefined;
    return row?.path ?? `file:${nodeId}`;
  }
  const row = db.prepare("SELECT name FROM symbols WHERE id = ?").get(nodeId) as { name: string } | undefined;
  return row?.name ?? `symbol:${nodeId}`;
}

function nodeKey(nodeType: NodeType, nodeId: number): string {
  return `${nodeType}:${nodeId}`;
}

function relationshipWeight(kind: string): number {
  if (kind === "covered_by") {
    return 1.0;
  }
  if (kind === "imports") {
    return 0.86;
  }
  if (kind === "contains") {
    return 0.72;
  }
  if (kind === "co_changes") {
    return 0.62;
  }
  return 0.5;
}
