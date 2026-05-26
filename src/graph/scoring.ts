export function tokenize(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .filter((token) => token.length > 1);
}

export function scoreText(query: string, candidate: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return 0;
  }
  const candidateTokens = new Set(tokenize(candidate));
  const lowered = candidate.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (candidateTokens.has(token)) {
      score += 1;
    } else if (/[\u4e00-\u9fa5]/u.test(token) && lowered.includes(token)) {
      score += 0.8;
    } else if (token.length >= 5 && lowered.includes(token)) {
      score += 0.5;
    }
  }
  return score / tokens.length;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}
