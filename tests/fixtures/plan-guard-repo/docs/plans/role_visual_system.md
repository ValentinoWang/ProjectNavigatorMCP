---
owner_domain: design_system
authority: canonical
depends_on:
  - docs/role-visual-system.md
sync_targets:
  - scripts/quality/check_role_visual_system_guard.py
  - frontend/lib/modules/design_system/theme/experience_theme.dart
validation:
  - python scripts/quality/check_role_visual_system_guard.py
  - python scripts/quality/check_design_system_usage_guard.py
---

# Role Visual System

The project should keep role visual surfaces aligned with the design system.

## Phase 0

- Run role visual guard.

```bash
python scripts/quality/check_role_visual_system_guard.py
python scripts/quality/check_design_system_usage_guard.py
```

## Phase 1

- Replace raw Duration and private role palette.

## Phase 5

- Run target widget test.
