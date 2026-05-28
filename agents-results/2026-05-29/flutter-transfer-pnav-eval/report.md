# flutter-transfer pnav discovery eval

Date: 2026-05-29

Target repo: `/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer`

Index refresh:

```json
{
  "files": 5571,
  "symbols": 33848,
  "imports": 19722,
  "routes": 439,
  "tests": 829,
  "commands": 108,
  "rules": 300,
  "documents": 64,
  "coChanges": 1000
}
```

Commands run for each scenario:

```bash
pnav discover /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "<task>" --limit 15
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "<task>"
pnav trace-feature /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "<task>" --limit 8
```

Additional high-risk impact checks:

```bash
pnav impact-v3 /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer frontend/lib/core/router/app_router.dart --task "<dashboard task>"
pnav impact-v3 /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer frontend/lib/core/router/auth_guard.dart --task "<identity task>"
pnav impact-v3 /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer backend/app/services/athlete_training_summary_service.py --task "<training summary API task>"
pnav impact-v3 /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer backend/app/services/data_sharing_service.py --task "<data sharing authz task>"
pnav impact-v3 /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer backend/app/models/session_plan.py --task "<DB index task>"
pnav impact-v3 /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer scripts/quality/check_frontend_card_layout_guard.py --task "<card guard triage task>"
pnav impact-v3 /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer tests/flutter-web/e2e/visual_pages.ts --task "<visual matrix task>"
```

## Result matrix

| #   | Scenario                                      | Verdict   | What worked                                                                                                                                                                       | Main miss                                                                                                                                                                      |
| --- | --------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Athlete Dashboard training trend card         | strong    | Strict mustRead hit route, page, main widget; trace gave verified route->page->widget chain; sections appeared as support.                                                        | Test/guard recommendations were broad and included unrelated auth/API guards before dashboard-specific tests.                                                                  |
| 2   | Workspace Microplan scroll/sliver             | strong    | Strict mustRead hit workspace page and microplan hosts/surfaces; recommended sliver and compact visual guards.                                                                    | Missed `workspace-microplan-scroll-guard` by exact command name.                                                                                                               |
| 3   | Personal/org identity switch stale nav/avatar | weak      | Found identity tests and auth/identity guards in command/test recommendations.                                                                                                    | Strict mustRead stayed on dashboard route/page/widget and missed `auth_guard.dart`, `primary_navigation_persona.dart`, `identity_capsule.dart`, and `app_bottom_nav_bar.dart`. |
| 4   | Cycle Plan Builder mobile stepper/save        | mixed     | Builder, notifier, detail, and template manager appeared somewhere in discovery/capsule.                                                                                          | Strict mustRead incorrectly prioritized `not_found_page.dart` and `app_router.dart`; trace was route/page only.                                                                |
| 5   | Training Summary API trendSlope + SDK         | mixed     | Found backend service/schema/API somewhere; warned contract-first and generated SDK should not be hand edited; `impact-v3` on service found backend tests and openapi/sdk guards. | Strict mustRead did not start at training summary service/schema/openapi; only exact guard hit was openapi SDK drift.                                                          |
| 6   | Data Sharing coach request authorization      | weak      | Recommended some auth/authorization guards.                                                                                                                                       | Did not hit frontend data_sharing or backend data_sharing service/API/schema in strict or broad paths; got pulled toward generic athlete/workspace material.                   |
| 7   | Competition Detail mobile density/visual QA   | mixed     | Found competition detail page somewhere and surfaced visual/mobile/screenshot concepts.                                                                                           | Strict mustRead stayed on harness/not-found/router; screenshot manifest and design-system context were not promoted.                                                           |
| 8   | Exercise Prescription engine/read DTO         | weak-plus | Found backend engine and workspace exercise builder somewhere.                                                                                                                    | Missed read DTO schema and all three exercise-specific guards in recommendations.                                                                                              |
| 9   | DB migration session plan index               | mixed     | Found migrations/model somewhere and recommended `db-schema-runtime-guard`; `impact-v3` on model identified session plan service/schema/tests.                                    | Strict mustRead did not promote migration/model; missed `alembic-single-head-guard`.                                                                                           |
| 10  | Card layout guard failure triage              | mixed     | Found guard script, guard test, and a source-layer frontend path somewhere; command hit `frontend-card-layout-guard`.                                                             | Strict mustRead only gave `app_router.dart`; it cannot parse guard output back to the real violating file unless `--guard-log` is provided.                                    |
| 11  | Auth 401 stale dashboard data                 | weak      | Recommended `frontend-auth-stable-user-guard` and `auth-state-transition-guard`; found dashboard API somewhere.                                                                   | Strict mustRead missed dashboard view model, auth guard, and invalidation provider; warning misclassified as contract-first OpenAPI work.                                      |
| 12  | Role visual web matrix screenshot gap         | weak      | Recommended role visual/screenshot commands.                                                                                                                                      | Strict mustRead went to dashboard route/page/widget instead of `visual_pages.ts`, `visual_capture.ts`, QA harness, and screenshot manifests.                                   |

Overall: 2 strong, 5 mixed, 1 weak-plus, 4 weak.

## Capability readout

The tool is already useful when the task is a Flutter route/page/widget navigation problem with stable path vocabulary. It performs well on Dashboard and Microplan because route evidence, page composition, and widget composition line up with the task wording.

It is not yet reliable as a project secretary for cross-boundary work. Identity, auth runtime state, generated SDK/API contract, DB migration, E2E screenshot matrix, and guard-failure triage need repo-local workflow knowledge or stronger deterministic evidence. The current fallback is often generic route/page discovery plus broad guard keyword matching.

`impact-v3` is more useful after a human or agent has already named the important file. For example, `auth_guard.dart`, `athlete_training_summary_service.py`, and `session_plan.py` produced credible affected tests/guards. But open-ended `discover` does not consistently find those same files as strict mustRead.

## Main improvement points

1. Add flutter-transfer repo-local workflow profiles in `.agents/pnav/workflow-profiles.json` or `.pnav/workflow-profiles.json`.
   Use profiles for identity switching, contract-first SDK, data sharing authorization, exercise DTO, DB migration, guard triage, and visual matrix tasks. The existing code already supports repo-local profiles, but this repo currently has none.

2. Make strict mustRead domain-aware beyond route chains.
   For tasks containing `identity switch`, `401`, `authorization`, `data sharing`, `read DTO`, `migration`, `screenshot matrix`, or `guard failed`, route/page evidence should not dominate domain boundary files.

3. Tighten command ranking.
   `relatedTests` currently boosts all guard/test/analyze/lint commands broadly, then applies domain command boosts. This causes huge generic guard lists. Add task-domain command allow/deny rules and prefer exact Make targets.

4. Promote source-of-truth and generated-file policy.
   Contract/API tasks should put OpenAPI source, backend route/schema/service, SDK generation commands, and generated read-only policies into the authoritative handoff. The warning exists, but the strict read order is still inconsistent.

5. Add a real guard-log eval path.
   Scenario 10 cannot be judged only from task text. The durable behavior should be: parse failing guard output `file:line`, promote the violating source file, keep the guard script/test as supporting context, and avoid allowlist-only repairs.

6. Separate visual/E2E harness discovery from UI source discovery.
   Screenshot matrix tasks should rank `tests/flutter-web/e2e/visual_pages.ts`, `visual_capture.ts`, screenshot manifests, and QA harness docs above dashboard page files unless the task explicitly asks to edit the page.

7. Improve `impact-v3` target anchoring.
   `impact-v3` currently calls `discoverCode(repoPath, task, 12)` and reuses generic authoritative handoff for affected entrypoints. For non-UI targets, affected entrypoints should come from target-specific callers/cochange/test evidence, not the task's generic route chain.

## Boundaries

- Good fit now: route/page/widget work, page layout tasks with explicit module names, and human-seeded impact analysis for known critical files.
- Usable with caution: API contract, DB migration, auth state, visual QA, and guard triage when the agent supplies key files or guard logs.
- Not enough yet: fully autonomous open-ended project-secretary behavior across backend/frontend/generated/E2E boundaries.

## Next direction

The next useful milestone should be a flutter-transfer production eval suite plus repo-local workflow profiles. Add the 12 scenarios as deterministic eval cases, then make one ranking improvement at a time until strict mustRead and recommended commands pass. The first four fixes should target identity switch, data sharing authorization, screenshot matrix, and guard failure triage because those are the clearest current misses.

## Post-fix validation

Follow-up changes made:

- Added `/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/workflow-profiles.json` with 12 repo-local workflow profiles.
- Added `/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/discovery-suite.json` with the 12 production eval cases.
- Added missing Make target bodies in `/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/Makefile` for:
  - `alembic-single-head-guard`
  - `frontend-canonical-route-guard`
  - `workspace-microplan-scroll-guard`
  - `role-visual-system-guard`
- Updated `src/discovery/strictMustReadGate.ts` so explicit workflow `direct_target` files can enter strict `mustRead` even when they are validation artifacts or cross-stack backend/frontend files. This keeps ordinary noisy tests/screenshots suppressed, but lets repo-local profiles deliberately promote screenshot matrix, E2E registry, manifest, DTO, and backend contract sources.
- Added regression coverage in `tests/productionGateSuppression.test.ts`.

Validation commands:

```bash
npm test -- productionGateSuppression
npm run typecheck
npm run build
pnav scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer --incremental
make -n alembic-single-head-guard frontend-canonical-route-guard workspace-microplan-scroll-guard
make -n role-visual-system-guard
pnav eval /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer --suite /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer/.agents/pnav/discovery-suite.json --strict
```

Post-fix eval result:

```json
{
  "productionScore": 0.992,
  "casesPassed": "12/12",
  "hardFailures": 0,
  "passed": true
}
```

Remaining issues exposed:

1. `pnav eval` latency is now the main exposed weakness. All 12 cases passed, but the DB migration, card layout guard triage, auth 401, and role visual matrix cases still exceeded the fast-path latency threshold, so those case scores were capped at `0.976`.
2. `pnav scan --incremental` still has a long silent phase and reported `conservativeFullRebuild: true` despite only 6 changed files. The result was correct, but the UX and incremental-cost signal need work.
3. `relatedTests.commands` can still be broad. The authoritative `workflowProtocol.recommendedCommands` is now correct for these 12 cases, but the legacy `relatedTests.commands` list still includes generic frontend guards for broad visual tasks.
4. `trace-feature` is intentionally not fixed by repo-local profiles yet. The strict `discover` handoff is now reliable for the 12 scenarios, but standalone trace output can still follow generic route/page chains for non-route work.
