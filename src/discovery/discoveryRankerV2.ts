import type { FileHit } from "../graph/types.js";

export function rankByEvidenceChain(items: FileHit[]): FileHit[] {
  return [...items].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}
