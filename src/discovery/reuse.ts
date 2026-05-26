import { fingerprintCode, tokenizeCode } from "../analysis/codeFingerprint.js";
import { compareTokenSets } from "../analysis/similarity.js";
import type { ProjectDatabase } from "../db/connection.js";
import { openProject } from "../db/project.js";
import { scoreText } from "../graph/scoring.js";
import { reuseVerdict } from "./discoveryQuality.js";
import type { SimilarCodeHit } from "./types.js";

interface BlockRow {
  blockId: number;
  path: string;
  name: string | null;
  qualifiedName: string | null;
  kind: string;
  normalizedHash: string | null;
  tokensJson: string;
}

export function findSimilarCode(
  repoPath: string,
  target: string,
  limit = 10
): { query: string; matches: SimilarCodeHit[] } {
  const project = openProject(repoPath);
  try {
    const blocks = loadBlocks(project.db, project.repo.id);
    const targetBlock = blocks.find(
      (block) => block.path === target || block.name === target || block.qualifiedName === target
    );
    if (!targetBlock) {
      return { query: target, matches: [] };
    }
    const queryTokens = parseTokens(targetBlock.tokensJson);
    const hits = compareTokenSets(
      { tokens: queryTokens, normalizedHash: targetBlock.normalizedHash },
      blocks
        .filter((block) => block.blockId !== targetBlock.blockId)
        .map((block) => ({
          blockId: block.blockId,
          path: block.path,
          name: block.name,
          qualifiedName: block.qualifiedName,
          normalizedHash: block.normalizedHash,
          tokens: parseTokens(block.tokensJson)
        }))
    );
    return { query: target, matches: hits.slice(0, limit).map(toSimilarHit) };
  } finally {
    project.db.close();
  }
}

export function findReusableComponents(
  repoPath: string,
  task: string,
  limit = 10
): { query: string; reuseCandidates: SimilarCodeHit[]; duplicateRisks: SimilarCodeHit[] } {
  const project = openProject(repoPath);
  try {
    const blocks = loadBlocks(project.db, project.repo.id);
    const queryTokens = tokenizeCode(task);
    const queryFingerprint = fingerprintCode(task);
    const tokenHits = compareTokenSets(
      { tokens: queryTokens, normalizedHash: queryFingerprint.normalizedHash },
      blocks.map((block) => ({
        blockId: block.blockId,
        path: block.path,
        name: block.name,
        qualifiedName: block.qualifiedName,
        normalizedHash: block.normalizedHash,
        tokens: [
          ...parseTokens(block.tokensJson),
          ...tokenizeCode(`${block.path} ${block.name ?? ""} ${block.qualifiedName ?? ""}`)
        ]
      }))
    );
    const pathHits = blocks
      .map((block) => ({
        blockId: block.blockId,
        path: block.path,
        name: block.name,
        qualifiedName: block.qualifiedName,
        similarity: scoreText(task, `${block.path} ${block.name ?? ""} ${block.qualifiedName ?? ""}`),
        reason: "Task tokens match reusable symbol/path."
      }))
      .filter((hit) => hit.similarity > 0.15);
    const combined = dedupeSimilar([...tokenHits, ...pathHits].map(toSimilarHit));
    const reuseCandidates = combined
      .filter((hit) =>
        /component|widget|card|service|hook|provider/i.test(`${hit.reuseType} ${hit.symbol ?? ""} ${hit.path}`)
      )
      .map((hit) => reuseVerdict(task, hit))
      .slice(0, limit);
    return {
      query: task,
      reuseCandidates,
      duplicateRisks: combined
        .filter((hit) => hit.similarity >= 0.58)
        .map((hit) => reuseVerdict(task, hit))
        .slice(0, limit)
    };
  } finally {
    project.db.close();
  }
}

function loadBlocks(db: ProjectDatabase, repoId: number): BlockRow[] {
  return db
    .prepare(
      `SELECT id AS blockId, path, name, qualified_name AS qualifiedName, kind,
              normalized_hash AS normalizedHash, tokens_json AS tokensJson
       FROM code_blocks
       WHERE repo_id = ? AND json_array_length(tokens_json) > 4`
    )
    .all(repoId) as BlockRow[];
}

function parseTokens(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toSimilarHit(hit: {
  path: string;
  name: string | null;
  qualifiedName: string | null;
  similarity: number;
  reason: string;
}): SimilarCodeHit {
  return {
    symbol: hit.name,
    qualifiedName: hit.qualifiedName,
    path: hit.path,
    similarity: Number(Math.min(1, hit.similarity).toFixed(2)),
    reuseType: inferReuseType(hit.path, hit.name ?? hit.qualifiedName ?? ""),
    why: hit.reason
  };
}

function inferReuseType(path: string, name: string): string {
  if (/Widget|Card|Page|Screen|View|component/i.test(`${path} ${name}`)) {
    return "component";
  }
  if (/Service|Repository|Client/i.test(name)) {
    return "service";
  }
  if (/^use[A-Z]/.test(name)) {
    return "hook";
  }
  return "code_block";
}

function dedupeSimilar(items: SimilarCodeHit[]): SimilarCodeHit[] {
  const best = new Map<string, SimilarCodeHit>();
  for (const item of items) {
    const key = `${item.path}:${item.qualifiedName ?? item.symbol ?? ""}`;
    const existing = best.get(key);
    if (!existing || item.similarity > existing.similarity) {
      best.set(key, item);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.similarity - a.similarity || a.path.localeCompare(b.path));
}
