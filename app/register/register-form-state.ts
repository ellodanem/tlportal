export type RegisterFormState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | { ok: null };

export const registerFormInitialState: RegisterFormState = { ok: null };
