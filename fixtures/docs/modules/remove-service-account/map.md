---
status: active
ado: 84997
superseded_by: null
---

# Remove the service account — Wayfinder Map

Label: wayfinder:map
Charted: Nov 10, 2026.
Source: owner, "no scheduled task should call the app with a key".

## Destination

No service account and no API key remain on any environment.

Reached when:
- Nothing scheduled calls a route.
- The key and SQL login are deleted.

## Order

1. [01](issues/01-entrypoints-and-callers.md), then [02](issues/02-cutover.md).
2. Key owner ([03](issues/03-decide-key-owner.md)), then rotation.

## Tickets

<!-- tickets:begin view=kanban -->
| # | Ticket | Type | Blocked by | Waiting on | Status | PR |
|---|---|---|---|---|---|---|
| 01 | [Every scheduled job has a direct entrypoint](issues/01-entrypoints-and-callers.md) | task | — | — | done — merged to dev in PR 201, Nov 12 | 201 |
| 02 | [Cut over: nothing scheduled calls a route](issues/02-cutover.md) | build | [01](issues/01-entrypoints-and-callers.md) | — | in-review — PRs open, Nov 18 | 204, 205 |
| 03 | [Decide who owns the Key Vault key](issues/03-decide-key-owner.md) | decision, build | — | — | done — decided Nov 14, 2026 | — |
| 04 | [Rotate the key in Key Vault](issues/04-rotate-in-vault.md) | build | 03#q3 | — | in-progress — started Nov 18 | — |
| 05 | [Grill: what runs on UAT at night](issues/05-grill-uat-schedule.md) | grilling | — | owner | open | — |
| 06 | [DBA drops the SQL login](issues/06-dba-rotate-sql-login.md) | task | [05](issues/05-grill-uat-schedule.md), 05#q3 | dba | blocked — DBA window Nov 24 | — |
| 07 | [Ops delete the old Key Vault secret](issues/07-ops-delete-secret.md) | task | one-cash-mover 05, one-cash-mover 05#q3, one-cash-mover#q3 | ops | blocked | — |
| 08 | [Drop the nightly report job](issues/08-drop-nightly-report.md) | spike | — | — | dropped — the report moved to cloud-migration, Nov 16 | — |
| 09 | [First cutover plan (replaced)](issues/09-old-cutover-plan.md) | task | — | — | superseded — replaced by 02 | — |
| 10 | [Client signs off the removal](issues/10-client-signoff.md) | build, verify | cloud-migration 07#q3 | client | blocked | — |
| 11 | [Open the VNet rule for the new entrypoint](issues/11-vnet-rule.md) | bug | [02](issues/02-cutover.md) | infra | blocked — waiting for Rico | — |
<!-- tickets:end -->

## Risks

### <a id="r1"></a>R1 — Prod has a caller we never found
**Closed 2026-11-15:** audit log clean.

## Open questions (owner)

### <a id="q1"></a>Q1 — Do we keep a break-glass key
Open.

### <a id="q2"></a>Q2 — Who approves the prod window
**Answered 2026-11-17 (owner):** the owner.

### <a id="q3"></a>Q3 — Is cloud-migration 07 a prerequisite
Open. Related: [cloud-migration map](../cloud-migration/map.md#q1).

## Notes

- **Azure DevOps:** this module's card is **84997** (`dev-only`).
