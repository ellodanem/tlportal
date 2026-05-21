# Paid invoice PDF — spec (TL Portal)

**Status:** Approved for implementation (not built yet).  
**Depends on:** `BillingInvoice` mirror, Stripe webhooks, Billing tab UI.  
**Does not change:** subscription-first payment flow (Checkout / auto-renew).

---

## Goal

After Stripe marks an invoice **paid**, staff and clients need a **TL-branded PDF receipt** that:

- Shows a prominent **PAID** indicator (larger than a small corner ribbon).
- Can be **downloaded** and **reshared** from the customer **Billing** tab.
- Is tied to **one row per client** in `BillingInvoice` for operational history.
- Uses the same template later for **one-off hardware** charges (`kind: one_time`).

Payment still happens in Stripe first; the PDF is generated **after** payment (receipt), not a “pay this invoice” document.

---

## Invoice numbering — decision

### Options considered

| | **Stripe `invoice.number` as display #** | **TL serial `TL-INV-100837`** |
|---|------------------------------------------|----------------------------------|
| **Pros** | Zero sequencing logic; always matches Stripe Dashboard and disputes; already mirrored into `invoiceNumber` today; no duplicate “which #?” for support | Continuity with Zoho (`INV-100837`); one customer-facing series for Stripe + future one-offs; format you control on PDF; feels like “our invoice” |
| **Cons** | Format varies by Stripe settings; can be **null** until finalized; does not unify with manual/Invoiless-style numbers later; weak brand continuity for clients used to Ellodane invoice #s | Requires atomic sequence + migration; staff must know **TL #** vs Stripe id; small risk of gaps if webhook fails before allocate |

### Risks (TL serial) and mitigations

| Risk | Mitigation |
|------|------------|
| **Duplicate numbers** | `@@unique` on display field; allocate inside DB transaction |
| **Race on concurrent webhooks** | Single counter row (`AppSettings` or `InvoiceSequence`) with `UPDATE … RETURNING` |
| **Gaps in sequence** | Allocate on **`invoice.finalized`** (or first `invoice.paid`), not on draft; optional admin “void” does not reuse numbers |
| **Webhook never arrives** | Billing UI: “Sync from Stripe” / resend webhook; backfill job by `externalInvoiceId` |
| **Two numbers confuse staff** | PDF + UI: **large TL-INV**; Stripe # and `in_…` in footer / secondary column only |
| **Starting mid-stream from Zoho** | Seed counter (e.g. next = 100900) once before go-live |
| **Stripe amount ≠ PDF lines** | Line items and totals copied from **Stripe Invoice API** at PDF generation time, not hand-entered |

### Risks (Stripe-only) and why we pass

| Risk | Impact |
|------|--------|
| **Null or late `invoice.number`** | PDF header empty until finalized; awkward for “generate on paid” |
| **Split brain with Invoiless** | Manual customers keep Invoiless #s; Stripe customers show different shape — harder training |
| **One-off hardware later** | Hardware receipts would look like a different system unless you adopt Stripe numbers for everything |

### **Decision (locked)**

Use **TL serial as the customer-facing invoice number** on PDFs and in the Billing UI:

```text
TL-INV-100837
```

- **Allocate** when the invoice is first mirrored at **`invoice.finalized`** (preferred) or on **`invoice.paid`** if finalized was missed.
- **Store separately:**
  - `displayNumber` — `TL-INV-{n}` (unique globally)
  - `providerInvoiceNumber` — Stripe `invoice.number` (nullable)
  - `externalInvoiceId` — Stripe `in_…` (already exists; reconciliation key)

**Implementation note:** Today `BillingInvoice.invoiceNumber` holds Stripe’s number. When building PDFs, migrate to `providerInvoiceNumber` + new `displayNumber` (or repurpose fields per migration plan). Do not show Stripe’s number as the main header on the PDF.

---

## Document layout (Zoho-inspired)

Reference: Zoho sample (Ellodane header, line table, totals, notes). Adapt for **paid receipt** mode.

1. **PAID (dominant)**  
   - Diagonal watermark **PAID** / **PAID IN FULL** (~30–40% opacity), **or** full-width green banner under header with paid date.  
   - Must remain readable when printed B&W.

2. **Header**  
   - Title: **INVOICE** (receipt semantics; optional subtitle “Receipt”).  
   - **Invoice #:** `TL-INV-100837` (large).  
   - **Balance due:** **XCD 0.00** (bold).

3. **Branding**  
   - Ellodane logo + legal name (reuse proposal/branding settings).  
   - Company address / email (from env or Settings).

4. **Bill to**  
   - Customer name, address from TL `Customer` (same composition as Invoiless sync).

5. **Meta block**  
   - Invoice date, **paid date**, payment method (card brand + last4 from Stripe when available).  
   - Terms: **Paid in full** (not “Due on receipt”).

6. **Line items** (from Stripe invoice lines)  
   - Columns: #, Item & description, Qty, Rate, Amount (XCD).  
   - Subscription: include service period in description when `periodStart` / `periodEnd` set.  
   - Discount lines as negative rows (like Zoho sample).

7. **Totals**  
   - Subtotal, discounts, **Total**, **Payment received**, **Balance due XCD 0.00** (shaded bar).

8. **Footer**  
   - Notes / thank-you.  
   - Small print: Stripe reference `providerInvoiceNumber`, `externalInvoiceId`.

---

## Technical shape (implementation checklist)

| Piece | Approach |
|-------|----------|
| **Trigger** | `invoice.paid` webhook (after mirror upsert); optional manual “Regenerate PDF” on Billing tab |
| **Data** | `stripe.invoices.retrieve(in_…)` + expand lines; customer from `BillingInvoice.customerId` |
| **PDF engine** | Reuse patterns from `lib/proposals/pdf.ts` (or same stack) |
| **Storage** | Vercel Blob path on row: `pdfStoragePath`, `pdfGeneratedAt`; **freeze** PDF at generation (do not regenerate on template change unless staff clicks) |
| **UI** | Billing tab → Stripe invoices table: **Download PDF**, **Email PDF** (SMTP); keep **View** for Stripe hosted page |
| **Email** | Optional auto-send receipt on `invoice.paid` (separate from payment-link email) |

### Schema additions (planned)

```prisma
// On BillingInvoice (names illustrative)
displayNumber          String   @unique  // TL-INV-100837
providerInvoiceNumber  String?           // Stripe invoice.number
pdfStoragePath         String?
pdfGeneratedAt         DateTime?
```

Plus sequence counter (e.g. `InvoiceSequence` table or field on `AppSettings`).

---

## Fit in roadmap

| Order | Item |
|-------|------|
| Done | Subscription-first Checkout, `BillingInvoice` mirror, Billing tab |
| **Next** | **This spec:** TL numbering + paid PDF generate/store/download/email |
| Then | One-off hardware (`one_time`) — same PDF template + `displayNumber` |
| Then | `invoice.paid` → advance `ServiceAssignment.nextDueDate` (renewal ladder) |
| Deferred | Invoice-first recurring for service plans |

---

## Out of scope (this slice)

- Replacing Stripe Checkout with invoice-before-pay for subscriptions.
- Building full Invoiless clone for Stripe customers.
- Credit notes / partial refunds (later).
- Customer self-service portal for invoices (only PDF resend from staff for now).

---

## Changelog

| Date | Note |
|------|------|
| 2026-05-21 | Spec created; numbering decision: TL-INV serial + Stripe refs stored separately |
