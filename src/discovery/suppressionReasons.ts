import type { DependencyTier } from "./dependencyTiers.js";

export type SuppressionReason =
  | "import_only_l10n_wrapper"
  | "logger_utility"
  | "api_error_wrapper"
  | "auth_cache_dependency"
  | "theme_token_support"
  | "generic_helper"
  | "e2e_artifact"
  | "screenshot_artifact"
  | "qa_manifest_artifact"
  | "backend_noise_for_frontend_task"
  | "generated_api_model"
  | "design_system_base_component_support"
  | "supporting_dependency_only"
  | "framework_dependency_only"
  | "domain_noise"
  | "test_noise"
  | "insufficient_strong_evidence"
  | "below_must_read_threshold";

export interface SuppressionExplanation {
  reason: SuppressionReason;
  detail: string;
  downgradedTo: "shouldInspect" | "supportingContext" | "ignoreForNow";
  confidence: number;
}

export interface SuppressionInput {
  task: string;
  path: string;
  tier: DependencyTier;
  evidence: string[];
  score: number;
  testNoise?: boolean;
  noisy?: boolean;
  evidenceEnough?: boolean;
}

export function explainSuppression(input: SuppressionInput): SuppressionExplanation {
  const loweredTask = input.task.toLowerCase();
  const loweredPath = input.path.toLowerCase();
  const frontendTask = /页面|界面|组件|卡片|widget|flutter|frontend|dashboard|card|ui|视觉/.test(loweredTask);
  const apiTask = /api|接口|endpoint|schema|字段|backend|fastapi|database/.test(loweredTask);
  const designSystemTask = /design system|design-system|design_system|设计系统|视觉|token|guard|breakpoint|ds-/.test(
    loweredTask
  );
  const designSystemTokenPath = /modules\/design_system\/theme|theme|tokens|experience_theme|breakpoint/.test(
    loweredPath
  );

  if (/(^|\/)(e2e|maestro|patrol)(\/|$)|\.maestro\//.test(loweredPath)) {
    return explanation("e2e_artifact", "End-to-end artifact should not drive primary code discovery.", "ignoreForNow");
  }
  if (/(screenshots?|golden|ocr|snapshot)/.test(loweredPath)) {
    return explanation(
      "screenshot_artifact",
      "Screenshot or visual artifact is validation context, not implementation.",
      "ignoreForNow"
    );
  }
  if (/(^|\/)qa(\/|_)|qa_manifest|manifest\.json$/.test(loweredPath)) {
    return explanation(
      "qa_manifest_artifact",
      "QA manifest is validation metadata, not an editable implementation file.",
      "ignoreForNow"
    );
  }
  if (frontendTask && !apiTask && /^(backend|database|infra)\//.test(loweredPath)) {
    return explanation(
      "backend_noise_for_frontend_task",
      "Backend path matched a frontend/UI task only weakly.",
      "ignoreForNow"
    );
  }
  if (/\.g\.dart$|generated|openapi|api_client|packages\/api_client/.test(loweredPath)) {
    return explanation(
      "generated_api_model",
      "Generated API model or client code is supporting context only.",
      "supportingContext"
    );
  }
  if (/(^|\/)(l10n|locale|localizations?)(\/|\.|_)/.test(loweredPath)) {
    return explanation(
      "import_only_l10n_wrapper",
      "Localization wrapper is an import-only support dependency.",
      "supportingContext"
    );
  }
  if (/(logger|logging)/.test(loweredPath)) {
    return explanation(
      "logger_utility",
      "Logging utility is a support dependency rather than core task implementation.",
      "supportingContext"
    );
  }
  if (/(api_error|\/errors?\/)/.test(loweredPath)) {
    return explanation(
      "api_error_wrapper",
      "API error wrapper is support infrastructure, not primary implementation.",
      "supportingContext"
    );
  }
  if (/(auth_user_cache|auth.*cache|cache_provider)/.test(loweredPath)) {
    return explanation(
      "auth_cache_dependency",
      "Auth cache dependency is supporting state infrastructure.",
      "supportingContext"
    );
  }
  if (designSystemTask && designSystemTokenPath) {
    return explanation(
      "below_must_read_threshold",
      "Theme or token file is task-relevant for design-system work; suppress only without strong evidence.",
      "shouldInspect",
      0.72
    );
  }
  if (/(modules\/design_system\/theme|theme|tokens)/.test(loweredPath)) {
    return explanation(
      "theme_token_support",
      "Theme or token file is supporting visual infrastructure.",
      "supportingContext"
    );
  }
  if (/modules\/design_system\/(components|foundation)\//.test(loweredPath)) {
    return explanation(
      "design_system_base_component_support",
      "Design-system base component is reusable support, not task-specific implementation.",
      "supportingContext"
    );
  }
  if (/(utils?|helpers?|constants|shared|common)/.test(loweredPath)) {
    return explanation(
      "generic_helper",
      "Generic helper matched weakly and should not enter primary context.",
      "supportingContext"
    );
  }
  if (input.testNoise) {
    return explanation("test_noise", "Test file is not primary implementation for this non-test task.", "ignoreForNow");
  }
  if (input.tier === "framework_dependency") {
    return explanation(
      "framework_dependency_only",
      "Framework dependency is not task-owned implementation.",
      "supportingContext"
    );
  }
  if (input.tier === "supporting_dependency") {
    return explanation(
      "supporting_dependency_only",
      "Support dependency is useful context but not primary implementation.",
      "supportingContext"
    );
  }
  if (input.noisy) {
    return explanation("domain_noise", "Candidate matched outside the task domain.", "ignoreForNow");
  }
  if (input.evidenceEnough === false) {
    return explanation(
      "insufficient_strong_evidence",
      "Candidate lacks route, composition, direct-target, or reuse evidence.",
      "shouldInspect",
      0.82
    );
  }
  return explanation(
    "below_must_read_threshold",
    "Candidate did not meet the strict mustRead score threshold.",
    "shouldInspect",
    0.78
  );
}

function explanation(
  reason: SuppressionReason,
  detail: string,
  downgradedTo: SuppressionExplanation["downgradedTo"],
  confidence = 0.9
): SuppressionExplanation {
  return { reason, detail, downgradedTo, confidence };
}
