import { jaccardSimilarity } from "./codeFingerprint.js";

export interface SimilarityHit {
  blockId: number;
  path: string;
  name: string | null;
  qualifiedName: string | null;
  similarity: number;
  reason: string;
}

export function compareTokenSets(
  query: { tokens: string[]; normalizedHash?: string | null },
  candidates: Array<{
    blockId: number;
    path: string;
    name: string | null;
    qualifiedName: string | null;
    normalizedHash?: string | null;
    tokens: string[];
  }>
): SimilarityHit[] {
  return candidates
    .map((candidate) => {
      const exact = query.normalizedHash && candidate.normalizedHash === query.normalizedHash;
      const similarity = exact ? 1 : jaccardSimilarity(query.tokens, candidate.tokens);
      return {
        blockId: candidate.blockId,
        path: candidate.path,
        name: candidate.name,
        qualifiedName: candidate.qualifiedName,
        similarity,
        reason: exact ? "Normalized body hash matches exactly." : "Normalized body token shingles are similar."
      };
    })
    .filter((hit) => hit.similarity >= 0.35)
    .sort((a, b) => b.similarity - a.similarity || a.path.localeCompare(b.path));
}
