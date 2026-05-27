# Authoritative Handoff

`discover_code.data.authoritativeHandoff` is the production Discovery Mode contract.

Agents should treat `authoritativeHandoff.mustRead` as the only primary read list.

Fields:

- `mode`: always `strict_discovery`.
- `confidence`: overall confidence for the strict handoff.
- `chainStatus`: `verified_chain`, `partial_chain`, or `candidate_chain`.
- `mustRead`: strict primary files with role, evidence, and confidence.
- `coreChain`: route-to-widget or business-flow chain steps.
- `reuseDecision`: best reuse decision for avoiding duplicated implementation.
- `impactSummary`: critical tests and files.
- `supportingContext`: downgraded support dependencies.
- `suppressedCandidates`: candidates removed from primary context with reasons.
- `strictGate`: budget and dropped-file audit.
