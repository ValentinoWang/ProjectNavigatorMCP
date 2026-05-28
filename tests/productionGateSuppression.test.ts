import { describe, expect, it } from "vitest";
import { strictMustReadGate } from "../src/discovery/strictMustReadGate.js";
import type { SuppressionReason } from "../src/discovery/suppressionReasons.js";

const task = "新增 athlete dashboard training trend card";

const expectedReasons: Array<{ path: string; reason: SuppressionReason }> = [
  { path: "frontend/lib/l10n/l10n.dart", reason: "import_only_l10n_wrapper" },
  { path: "frontend/lib/core/logging/logger.dart", reason: "logger_utility" },
  { path: "frontend/lib/core/errors/api_error.dart", reason: "api_error_wrapper" },
  { path: "frontend/lib/modules/auth/auth_user_cache_provider.dart", reason: "auth_cache_dependency" },
  { path: "frontend/lib/modules/design_system/theme/experience_theme.dart", reason: "theme_token_support" },
  { path: "frontend/lib/utils/dashboard_helpers.dart", reason: "generic_helper" },
  { path: "frontend/e2e/maestro/dashboard_flow.yaml", reason: "e2e_artifact" },
  { path: "frontend/screenshots/dashboard_training_trend.png", reason: "screenshot_artifact" },
  { path: "frontend/qa/dashboard_qa_manifest.json", reason: "qa_manifest_artifact" },
  { path: "backend/app/services/trend_service.py", reason: "backend_noise_for_frontend_task" },
  { path: "frontend/lib/packages/api_client/dashboard_trend_model.g.dart", reason: "generated_api_model" },
  {
    path: "frontend/lib/modules/design_system/components/dashboard_card_base.dart",
    reason: "design_system_base_component_support"
  }
];

describe("production gate suppression reasons", () => {
  it("keeps production noise out of mustRead with precise reasons", () => {
    const result = strictMustReadGate(
      task,
      [
        {
          path: "frontend/lib/core/router/app_router.dart",
          score: 0.95,
          role: "route",
          why: "route",
          evidence: ["route_match"]
        },
        ...expectedReasons.map((item) => ({
          path: item.path,
          score: 0.9,
          role: "ranked_candidate",
          why: "task tokens match",
          evidence: ["ranked_discovery"]
        }))
      ],
      [],
      5
    );

    expect(result.mustRead.map((item) => item.path)).toContain("frontend/lib/core/router/app_router.dart");
    expect(result.mustRead.length).toBeLessThanOrEqual(5);
    for (const item of expectedReasons) {
      expect(result.mustRead.map((file) => file.path)).not.toContain(item.path);
      expect(findSuppressed(result, item.path)?.reason).toBe(item.reason);
      expect(findSuppressed(result, item.path)?.reasonDetail).toBeTruthy();
    }
  });

  it("does not treat design-system theme tokens as support for design-system tasks", () => {
    const weakResult = strictMustReadGate("修复 DS-BREAKPOINT raw width design system token", [
      {
        path: "frontend/lib/modules/design_system/theme/experience_theme.dart",
        score: 0.9,
        role: "ranked_candidate",
        why: "design system token task",
        evidence: ["ranked_discovery"]
      }
    ]);

    expect(weakResult.mustRead).toEqual([]);
    expect(
      findSuppressed(weakResult, "frontend/lib/modules/design_system/theme/experience_theme.dart")?.reason
    ).not.toBe("theme_token_support");
    expect(
      findSuppressed(weakResult, "frontend/lib/modules/design_system/theme/experience_theme.dart")?.downgradedTo
    ).toBe("shouldInspect");

    const directResult = strictMustReadGate("修复 DS-BREAKPOINT raw width design system token", [
      {
        path: "frontend/lib/modules/design_system/theme/experience_theme.dart",
        score: 0.9,
        role: "direct_target",
        why: "guard target",
        evidence: ["direct_target"]
      }
    ]);

    expect(directResult.mustRead.map((file) => file.path)).toContain(
      "frontend/lib/modules/design_system/theme/experience_theme.dart"
    );
  });
});

function findSuppressed(result: ReturnType<typeof strictMustReadGate>, filePath: string) {
  return result.suppressedCandidates.find((item) => item.path === filePath);
}
