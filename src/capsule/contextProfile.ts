export type ContextProfile = "brief" | "standard" | "debug";

export interface ContextBudget {
  maxPrimaryFiles: number;
  maxSupportingFiles: number;
  maxCommands: number;
  maxWarnings: number;
  maxOutputChars: number;
  includeMemory: boolean;
  includeRules: boolean;
  includeDebug: boolean;
  includeFullDiscovery: boolean;
  includeWhyRelated: boolean;
  includeRoutes: boolean;
  includeSymbols: boolean;
}

export const CONTEXT_BUDGETS: Record<ContextProfile, ContextBudget> = {
  brief: {
    maxPrimaryFiles: 3,
    maxSupportingFiles: 2,
    maxCommands: 3,
    maxWarnings: 3,
    maxOutputChars: 2500,
    includeMemory: false,
    includeRules: false,
    includeDebug: false,
    includeFullDiscovery: false,
    includeWhyRelated: false,
    includeRoutes: false,
    includeSymbols: false
  },
  standard: {
    maxPrimaryFiles: 20,
    maxSupportingFiles: 20,
    maxCommands: 20,
    maxWarnings: 20,
    maxOutputChars: 12000,
    includeMemory: true,
    includeRules: true,
    includeDebug: true,
    includeFullDiscovery: true,
    includeWhyRelated: true,
    includeRoutes: true,
    includeSymbols: true
  },
  debug: {
    maxPrimaryFiles: 100,
    maxSupportingFiles: 100,
    maxCommands: 100,
    maxWarnings: 100,
    maxOutputChars: 50000,
    includeMemory: true,
    includeRules: true,
    includeDebug: true,
    includeFullDiscovery: true,
    includeWhyRelated: true,
    includeRoutes: true,
    includeSymbols: true
  }
};

export function resolveContextProfile(profile?: ContextProfile): ContextProfile {
  return profile ?? "standard";
}

export function contextBudget(profile: ContextProfile): ContextBudget {
  return CONTEXT_BUDGETS[profile];
}
