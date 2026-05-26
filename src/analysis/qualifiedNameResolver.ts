import type { ResolvedSymbol } from "../discovery/symbolResolver.js";

export function symbolDisplayName(symbol: ResolvedSymbol | null, fallback: string): string {
  return symbol?.qualifiedName ?? symbol?.name ?? fallback;
}
