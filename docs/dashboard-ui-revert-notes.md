# Dashboard UI — revert reference (account health, 2026-05-19)

## What changed

- **Admin dashboard** (`app/admin/page.tsx`): added **Fleet attention** summary (four status buckets + short review queue) after the KPI strip.
- **Customer overview** (`app/admin/customers/[id]/page.tsx`): added **Account health** summary cards and optional `?fleet=` filter on the service assignments table; billing/ops KPI strip kept above health.

## Pre-change snapshots

Full file copies before this work:

- `docs/snapshots/pre-account-health-2026-05-19/admin-page.tsx`
- `docs/snapshots/pre-account-health-2026-05-19/customer-detail-page.tsx`

## Revert (restore prior UI only)

```powershell
Copy-Item docs\snapshots\pre-account-health-2026-05-19\admin-page.tsx app\admin\page.tsx -Force
Copy-Item docs\snapshots\pre-account-health-2026-05-19\customer-detail-page.tsx "app\admin\customers\[id]\page.tsx" -Force
```

Then remove account-health-only additions if you want a clean tree:

- `lib/admin/fleet-health.ts`
- `components/dashboard/fleet-health-summary.tsx`
- Revert any `fleetHealth` fields added to `lib/admin/dashboard-stats.ts`

Or revert the whole commit via Git if this was committed as one changeset.

## New modules (for reference)

| Path | Role |
|------|------|
| `lib/admin/fleet-health.ts` | Classify open assignments into total / healthy / renewal / review |
| `components/dashboard/fleet-health-summary.tsx` | Four-card summary UI (admin + customer) |
