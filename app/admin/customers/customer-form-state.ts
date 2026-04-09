/** Shared with client forms and server actions — not a "use server" module. */
export type CustomerFormActionState = { error: string | null };

export const customerFormInitialState: CustomerFormActionState = { error: null };
