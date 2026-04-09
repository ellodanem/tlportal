/** Shared with client forms and server actions — not a "use server" module. */
export type DeviceFormActionState = { error: string | null };

export const deviceFormInitialState: DeviceFormActionState = { error: null };
