export type RepairAction = "open" | "inspect" | "edit" | "run" | "audit";
export type FileEditTier = "must_edit" | "may_edit" | "may_inspect" | "reference_only" | "do_not_touch";

export interface MinimalRepairStep {
  order: number;
  action: RepairAction;
  target?: string;
  command?: string;
  instruction?: string;
  tier?: FileEditTier;
  why: string;
}

export interface MinimalRepairPath {
  steps: MinimalRepairStep[];
  confidence: number;
  warnings: string[];
}
