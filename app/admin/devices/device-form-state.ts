/** Shared with client forms and server actions — not a "use server" module. */
export type DeviceFormActionState = {
  error: string | null;
  message?: string | null;
  /** When set after success, the client navigates here (avoids redirect + useActionState edge cases). */
  next?: string | null;
};

export const deviceFormInitialState: DeviceFormActionState = { error: null, message: null, next: null };
