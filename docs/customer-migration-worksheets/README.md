# Customer migration worksheets

Use one worksheet per existing customer before creating a canonical migration campaign. The worksheet is a review record, not an authorization and not a source of billing authority.

1. Copy [`customer-migration-worksheet-template.md`](customer-migration-worksheet-template.md).
2. Populate it from TL Portal's read-only records and, where relevant, the existing Stripe Dashboard or approved provider evidence.
3. Mark every fact as **verified**, **reported**, or **unavailable**. Do not turn an unavailable fact into an assumed commercial term.
4. Have the owner correct and approve the commercial section.
5. Re-open the matching proposal in **Subscriptions → Canonical subscriptions → Migration campaign**, recheck the current source and worksheet, and use the existing owner-approved individual migration flow.

For Stripe arrangements, the existing flow requires an exact locally stored subscription reference and explicit provider evidence (status, items, prices, quantities, and future collection review). Creating a canonical shadow does not transfer billing authority. No provider subscription is created, changed, paused, or cancelled by the worksheet process.

Keep worksheets free of card data, Stripe secrets, device IMEIs, SIM ICCIDs, and unnecessary customer contact details. Prefer internal IDs and masked or count-only equipment references.
