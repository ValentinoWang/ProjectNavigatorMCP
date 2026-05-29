export type EvidenceFreshness = "fresh" | "partial" | "weak" | "stale" | "stale_until_full_scan" | "metadata_only";

export interface FreshEvidence {
  type: string;
  freshness?: EvidenceFreshness;
  critical?: boolean;
}

export function defaultFreshnessForEvidence(type: string): EvidenceFreshness {
  if (/cochange|co_change|git/i.test(type)) {
    return "stale_until_full_scan";
  }
  if (/weak/i.test(type)) {
    return "weak";
  }
  if (/metadata_only/i.test(type)) {
    return "metadata_only";
  }
  return "fresh";
}

export function canUseAsStrongEvidence(freshness: EvidenceFreshness | undefined): boolean {
  return freshness === undefined || freshness === "fresh" || freshness === "partial";
}

export function hasStaleCriticalEvidence(items: FreshEvidence[]): boolean {
  return items.some((item) => item.critical === true && !canUseAsStrongEvidence(item.freshness));
}
