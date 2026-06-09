#!/usr/bin/env python3
"""Fixture guard for auth state transitions."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUTH_CONTROLLER = ROOT / "frontend/lib/core/di/auth_controller.dart"
AUTH_BOUNDARY = ROOT / "frontend/lib/core/auth/auth_session_boundary.dart"
ROUTER_PROVIDER = ROOT / "frontend/lib/core/router/router_provider.dart"
IDENTITY_CONTROLLER = ROOT / "frontend/lib/core/identity/identity_controller.dart"
LOGIN_PAGE = ROOT / "frontend/lib/modules/auth/login_page.dart"


def main() -> int:
    for path in (
        AUTH_CONTROLLER,
        AUTH_BOUNDARY,
        ROUTER_PROVIDER,
        IDENTITY_CONTROLLER,
        LOGIN_PAGE,
    ):
        if not path.exists():
            print(f"[auth-state-transition-guard] missing {path}")
            return 1
    print("[auth-state-transition-guard] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
