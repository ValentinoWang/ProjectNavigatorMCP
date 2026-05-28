# Authoritative Handoff

`discover_code.data.authoritativeHandoff` is the production Discovery Mode contract.

Agents should treat `authoritativeHandoff.mustRead` as the only primary read list.

Fields:

- `mode`: always `strict_discovery`.
- `confidence`: overall confidence for the strict handoff.
- `chainStatus`: `verified_chain`, `partial_chain`, or `candidate_chain`.
- `chainDepth`: number of steps in the route/page/widget chain.
- `chainCompleteness`: one of `route_page_only`, `route_main_widget`, `route_section_card`, or `route_test_covered`.
- `testCoverage`: optional route-to-widget test coverage evidence with `coverageStrength`; tests do not enter `coreChain`.
- `mustRead`: strict primary files with role, evidence, and confidence.
- `coreChain`: route-to-widget or business-flow chain steps.
- `reuseDecision`: V2 reuse decision with verdict, API fit, missing params, affected callers, and recommended action.
- `impactSummary`: critical tests and files.
- `supportingContext`: downgraded support dependencies with optional `reason` and `reasonDetail`.
- `suppressedCandidates`: candidates removed from primary context with `reason`, `reasonDetail`, and reason confidence.
- `strictGate`: budget and dropped-file audit.
