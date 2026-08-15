/** Invoices visible in active AR lists, aging, and billing reminders. */
export const activeInvoiceWhere = { archivedAt: null } as const;

export const archivedInvoiceWhere = { archivedAt: { not: null } } as const;
