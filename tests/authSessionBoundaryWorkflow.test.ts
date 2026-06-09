import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareTaskContext } from "../src/capsule/prepareTaskContext.js";
import { discoverCode } from "../src/discovery/discoverCode.js";
import { scanRepo } from "../src/scanner/scanRepo.js";

const tempDirs: string[] = [];

function copyFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pnav-auth-session-boundary-"));
  tempDirs.push(root);
  cpSync(path.resolve("tests/fixtures/auth-session-boundary-repo"), root, { recursive: true });
  scanRepo(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("auth session boundary workflow", () => {
  it("merges precise built-in auth lifecycle guidance with broad repo-local identity profiles", () => {
    const repo = copyFixture();
    const result = discoverCode(
      repo,
      "AuthSessionBoundary root fix for frontend auth session lifecycle logout login principal change identity switch unauthorized drop",
      10
    );

    const protocol = result.authoritativeHandoff.workflowProtocol;
    const profileNames = protocol.profiles.map((profile) => `${profile.source}:${profile.name}`);
    const mustReadPaths = result.authoritativeHandoff.mustRead.map((item) => item.path);
    const commandNames = protocol.recommendedCommands.map((command) => command.command);

    expect(profileNames).toContain("built_in:auth_session_boundary_lifecycle");
    expect(profileNames).toContain("repo_local:flutter_transfer_identity_navigation_state");
    expect(mustReadPaths).toEqual(
      expect.arrayContaining([
        "frontend/lib/core/auth/auth_session_boundary.dart",
        "frontend/lib/core/di/auth_controller.dart",
        "frontend/lib/core/router/router_provider.dart",
        "frontend/lib/core/identity/identity_controller.dart",
        "scripts/quality/check_auth_state_transition_guard.py"
      ])
    );
    expect(mustReadPaths).not.toContain("frontend/lib/core/router/auth_guard.dart");
    expect(mustReadPaths).not.toContain("frontend/lib/core/navigation/primary_navigation_persona.dart");
    expect(mustReadPaths).not.toContain("frontend/lib/core/widgets/identity_capsule.dart");
    expect(mustReadPaths).not.toContain(
      "frontend/lib/modules/design_system/components/organisms/app_bottom_nav_bar.dart"
    );
    expect(commandNames[0]).toBe("make auth-state-transition-guard");
    expect(protocol.actions.map((action) => action.type)).toEqual(
      expect.arrayContaining([
        "trace_auth_session_boundary_root",
        "verify_auth_controller_transition_hooks",
        "verify_router_uses_session_resync"
      ])
    );
  });

  it("keeps workflow-driven capsules focused on authoritative handoff files", () => {
    const repo = copyFixture();
    const context = prepareTaskContext(
      repo,
      "AuthSessionBoundary root fix for frontend auth session lifecycle logout login principal change identity switch unauthorized drop",
      { includeMemory: false, includeDirtyStatus: false }
    );
    const corePaths = context.coreReadOrder.map((item) => item.path);
    const recommendedCommands = context.recommendedCommands.map((command) => command.command);

    expect(corePaths).toHaveLength(5);
    expect(corePaths).toEqual(
      expect.arrayContaining([
        "frontend/lib/core/auth/auth_session_boundary.dart",
        "frontend/lib/core/di/auth_controller.dart",
        "scripts/quality/check_auth_state_transition_guard.py",
        "frontend/lib/core/router/router_provider.dart",
        "frontend/lib/core/identity/identity_controller.dart"
      ])
    );
    expect(recommendedCommands).toEqual([
      "make auth-state-transition-guard",
      "make frontend-auth-stable-user-guard",
      "make identity-role-preservation-guard",
      "make auth-identity-contract-guard"
    ]);
  });
});
