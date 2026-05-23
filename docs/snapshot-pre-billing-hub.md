# Snapshot: before Billing ops hub

**Date:** 2026-05-22  
**Branch:** `snapshot/pre-billing-hub-20260522` @ `2ec54a9`  
**Tag:** `pre-billing-hub-20260522`

## Revert implementation

```bash
git checkout snapshot/pre-billing-hub-20260522
# or reset main to snapshot (destructive on main):
# git checkout main
# git reset --hard snapshot/pre-billing-hub-20260522
```

## What was added after this snapshot

- `/admin/billing` — Billing ops queues (renewals, Stripe, linkage)
- Nav item **Billing ops** (Invoices unchanged)
- Dashboard links → customer Billing + Billing ops hub

See `docs/billing-agent-handoff.md` → Admin IA — Billing ops hub.
