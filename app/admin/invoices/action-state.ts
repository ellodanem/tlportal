export type InvoiceCreateFormState = { error: string | null };

export const invoiceCreateInitialState: InvoiceCreateFormState = { error: null };

export type InvoiceDeleteState = { ok: boolean; error: string | null };

export const invoiceDeleteInitialState: InvoiceDeleteState = { ok: false, error: null };
