# Customer migration worksheet — Venture ATV

**Worksheet status:** Draft — owner commercial review required  
**Evidence date:** 2026-10-18  
**Prepared from:** Owner-supplied TL Portal migration-screen observations and repository code review only  
**Evidence standard:** **Reported** is a portal display observation, not an independent production or Stripe verification. **Unavailable** means no authorized read-only production database or Stripe access was available in this workspace.  
**Scope:** No production migration, Stripe operation, invoice, payment, or notification has been performed.

## A. Customer information

| Field | Value | Evidence / status |
| --- | --- | --- |
| Customer display name | Venture ATV | **Reported** — migration interface observation |
| Internal customer reference | Unavailable | **Unavailable** — no production record access |
| Legacy source arrangement | Stripe subscription | **Reported** — migration interface observation |
| Current collection method | Stripe autocharge | **Reported** — migration interface observation |
| Legacy cycle displayed | EC$25.00 | **Reported** — preliminary UI value; not commercial proof |
| Relevant account status | Unavailable | **Unavailable** — local repository contains no customer fixture or data record |
| Existing subscription or schedule reference(s) | Unavailable | **Unavailable** — source ID must be read from the current portal record |

## B. Tracking services and equipment

| Check | Value | Evidence / status |
| --- | --- | --- |
| Active tracking services | Unavailable | **Unavailable** — count must come from active service assignments |
| Active service-assignment references | Unavailable | **Unavailable** — obtain internal assignment IDs from TL Portal |
| Associated device references | Unavailable | **Unavailable** — do not export IMEIs for this worksheet |
| Associated SIM references | Unavailable | **Unavailable** — do not export ICCIDs for this worksheet |
| Assignment conflicts, gaps, or replacements | Unknown | **Unavailable** pending assignment review |

## C. Commercial agreement

| Term | Proposed or confirmed value | Evidence / status |
| --- | --- | --- |
| Actual commercial start date | Unavailable | **Unavailable** — do not use a historical displayed next-billing date as the anchor |
| Billing interval | Unavailable | **Unavailable** — EC$25 alone does not establish monthly versus another cadence |
| Price per service per cycle | Unavailable | **Unavailable** — must reconcile to active services and provider items |
| Total recurring amount per cycle | EC$25.00 shown in UI | **Reported**, not verified recurring price |
| Currency | XCD (EC$) | **Reported** from displayed UI value |
| Negotiated-rate exceptions | Unknown | **Unavailable** |
| Paid-through coverage | Unavailable | **Unavailable** — payment/period evidence required |
| Next intended billing date | Unavailable | **Unavailable** — displayed historical date must not be reused without provider review |
| Grace period | 7 days proposed | **Proposed** — confirm owner policy for this arrangement |
| Special terms | Unknown | **Unavailable** |

## D. Financial reconciliation

| Check | Finding | Evidence / status |
| --- | --- | --- |
| Relevant recurring invoices | Unavailable | **Unavailable** — inspect local mirrors and provider invoices by subscription reference |
| One-off invoices | Unknown | **Unavailable** — hardware/installation card invoices must be classified separately |
| Payments received | Unavailable | **Unavailable** — provider invoice/payment evidence required |
| Outstanding subscription-related balance | EC$0.00 displayed | **Reported** — not proof of paid-through coverage or provider balance |
| Existing recurring schedules | Unavailable | **Unavailable** — Stripe source may not have a native schedule |
| Existing provider subscription ID | Unavailable | **Required** — retrieve exact locally stored Stripe subscription reference |
| Provider status and cancellation state | Unavailable | **Required** — active/trialing/past_due/canceling/etc. |
| Provider items, prices, quantities, interval | Unavailable | **Required** — reconcile exactly to each active service |
| Provider current period / next collection | Unavailable | **Required** — determines paid-through and safe future cutover |
| Failed-payment, card-update, or collection exception | Unknown | **Required** — check provider state, not only portal summary |
| Possible future billing overlap | Unknown | **Required** — no canonical authority transfer until resolved |
| Immutable historical records | Any existing invoices, payments, provider references | **Rule** — must remain unchanged |

## E. Proposed canonical subscription

| Field | Proposed value | Evidence / status |
| --- | --- | --- |
| Subscription name | Venture ATV — GPS tracking | **Proposed** |
| Collection method | Stripe autocharge | **Reported**; retain only after provider review |
| Currency and billing interval | XCD / interval unavailable | Currency **reported**; interval **unavailable** |
| Billable services and per-cycle rates | Unavailable | **Required** — one verified rate for every active assignment |
| Expected recurring cycle total | Unavailable | EC$25.00 is not confirmed until services/provider reconcile |
| Hardware/service attribution | Unavailable | **Required** — active assignments only; no raw device/SIM identifiers in worksheet |
| Billing anchor | Unavailable | **Required** |
| First canonical renewal | Unavailable | **Required** — must be after verified paid-through coverage and safe provider cutover |
| Legacy-to-canonical cutover | Create shadow only after approval; retain legacy Stripe authority until a separately approved cutover | **Required safeguard** |
| Duplicate-billing prevention | Do not create/alter provider collection or generate canonical billing until authority transfer is approved | **Required safeguard** |

## F. Missing information requiring owner confirmation

Cursor can prefill these after an authorized operator opens the current TL Portal customer/proposal and Stripe Dashboard; the owner should then confirm the commercial conclusions:

1. Which exact active service assignments belong to Venture ATV, and are any paused, replaced, or intentionally excluded?
2. What is the agreed billing interval and agreed rate for each active service? Does the displayed EC$25.00 represent the entire recurring cycle or a per-service/month amount?
3. What is the verified paid-through end date and the intended next billable period?
4. What is the exact Stripe subscription ID, status, item/price IDs, quantities, recurring amount, current period, and next scheduled collection?
5. Are there any card-update, declined-payment, cancellation, or future-collection exceptions?
6. Are any historical Stripe invoices one-off hardware/installation charges rather than recurring service evidence?
7. Confirm whether a seven-day grace period applies after the first canonical renewal.

## G. Owner review and approval

### Commercial confirmation

- [ ] I confirm or correct the active service count and assignment mapping.
- [ ] I confirm the agreed rate(s), interval, currency, billing anchor, and next renewal.
- [ ] I confirm the paid-through coverage from actual invoice/payment/provider evidence.
- [ ] I confirm one-off hardware, installation, or deposit invoices are not used as recurring evidence.
- [ ] I confirm historical invoices and payments remain unchanged.
- [ ] I have reviewed the exact Stripe subscription, items, prices, quantity, status, current period, and future collection.

**Owner corrections / notes:**  
[record before execution]

**Commercial review completed by:** [owner]  
**Date:** YYYY-MM-DD

### Separate migration authorization

Do not execute from this worksheet. Once complete, reopen the current Venture ATV proposal in **Subscriptions → Canonical subscriptions → Migration campaign**. The existing individual review requires current provider evidence and owner confirmations, creates a fingerprint-bound plan, and rechecks the source before execution. A separate explicit production authorization is still required for the write.

## H. Migration execution result

| Result | Value |
| --- | --- |
| Current source / plan fingerprint rechecked | Not attempted |
| Canonical shadow creation status | Not attempted |
| Canonical subscription reference | Not created |
| Provider relationship result | Not reviewed |
| Billing-authority transfer status | Legacy Stripe billing retained |
| Legacy schedule/provider status | Unchanged |
| Preserved invoices and payments | No changes made |
| Financial exceptions | Provider and paid-through evidence unresolved |
| Premature invoice/payment/notification check | None generated |
| Actual completion status | Worksheet only — not authorized for migration |
