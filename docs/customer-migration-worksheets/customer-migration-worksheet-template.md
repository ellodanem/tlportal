# Customer migration worksheet — [customer display name]

**Worksheet status:** Draft / owner review / approved for migration planning / executed  
**Evidence date:** YYYY-MM-DD  
**Prepared from:** TL Portal read-only records / approved Stripe evidence / owner confirmation  
**Evidence standard:** Mark each fact as **Verified**, **Reported**, or **Unavailable**.  
**Scope:** This worksheet does not create a subscription, invoice, payment, provider change, notification, or billing-authority transfer.

## A. Customer information

| Field | Value | Evidence / status |
| --- | --- | --- |
| Customer display name |  |  |
| Internal customer reference |  |  |
| Legacy source arrangement | manual schedule / Stripe subscription / other |  |
| Current collection method | manual (cash, cheque, bank transfer) / Stripe autocharge |  |
| Relevant account status |  |  |
| Existing subscription or schedule reference(s) |  |  |

## B. Tracking services and equipment

| Check | Value | Evidence / status |
| --- | --- | --- |
| Active tracking services |  |  |
| Active service-assignment references |  |  |
| Associated device references | count or approved internal references only |  |
| Associated SIM references | count or approved internal references only |  |
| Assignment conflicts, gaps, or replacements | none known / describe |  |

## C. Commercial agreement

| Term | Proposed or confirmed value | Evidence / status |
| --- | --- | --- |
| Actual commercial start date |  |  |
| Billing interval | monthly / quarterly / semiannual / annual |  |
| Price per service per cycle |  |  |
| Total recurring amount per cycle |  |  |
| Currency |  |  |
| Negotiated-rate exceptions | none / describe |  |
| Paid-through coverage | start → end |  |
| Next intended billing date |  |  |
| Grace period | 7 days unless expressly agreed otherwise |  |
| Special terms |  |  |

## D. Financial reconciliation

| Check | Finding | Evidence / status |
| --- | --- | --- |
| Relevant recurring invoices | references, periods, totals, status |  |
| One-off invoices | references; explicitly separate from subscription evidence |  |
| Payments received | dates/amounts/references only as needed |  |
| Outstanding subscription-related balance |  |  |
| Existing recurring schedules | interval, next issue date, status |  |
| Stripe provider relationship | complete this row only for Stripe collection |  |
| Existing provider subscription ID |  |  |
| Provider status and cancellation state |  |  |
| Provider items, prices, quantities, interval |  |  |
| Provider current period / next collection |  |  |
| Failed-payment, card-update, or collection exception |  |  |
| Possible future billing overlap |  |  |
| Immutable historical records | invoices, payments, provider references |  |

For manual customers, mark Stripe-only fields **Not applicable**. For Stripe customers, a dashboard label or historical date alone is not enough evidence of paid-through coverage or the next future collection.

## E. Proposed canonical subscription

| Field | Proposed value | Evidence / status |
| --- | --- | --- |
| Subscription name |  |  |
| Collection method | manual invoice / Stripe autocharge |  |
| Currency and billing interval |  |  |
| Billable service assignments and per-cycle rates | one row or attachment per assignment |  |
| Expected recurring cycle total |  |  |
| Hardware/service attribution |  |  |
| Billing anchor |  |  |
| First canonical renewal |  |  |
| Legacy-to-canonical cutover | shadow only / approved authority transfer at next renewal |  |
| Duplicate-billing prevention | legacy remains authority until separately transferred |  |

## F. Missing information requiring owner confirmation

Only list facts that cannot be established by reliable records.

1. [Specific question]
2. [Specific question]

## G. Owner review and approval

### Commercial confirmation

- [ ] I confirm or correct the service count and assignment mapping.
- [ ] I confirm the agreed price, interval, currency, billing anchor, and next renewal.
- [ ] I confirm the paid-through coverage or have marked it unresolved for review.
- [ ] I confirm all one-off hardware, installation, deposit, and non-recurring invoices remain outside recurring pricing and coverage.
- [ ] I confirm outstanding balances and historical invoices/payments remain unchanged.
- [ ] For Stripe: I have reviewed the exact provider subscription, items, prices, quantity, status, current period, and future collection.

**Owner corrections / notes:**  
[record corrections]

**Commercial review completed by:** [owner]  
**Date:** YYYY-MM-DD

### Separate migration authorization

This commercial approval is **not** permission to write production records. Before execution, the authorized owner must approve the current, exact fingerprint-bound proposal in TL Portal. Recheck source evidence first; stop if the worksheet and current source differ.

## H. Migration execution result

_Complete only after an authorized migration attempt._

| Result | Value |
| --- | --- |
| Current source / plan fingerprint rechecked |  |
| Canonical shadow creation status | not attempted / created / blocked / failed |
| Canonical subscription reference |  |
| Provider relationship result | none / read-only linked / needs review |
| Billing-authority transfer status | legacy retained / separately approved / transferred |
| Legacy schedule/provider status |  |
| Preserved invoices and payments |  |
| Financial exceptions |  |
| Premature invoice/payment/notification check | none / describe |
| Actual completion status |  |
