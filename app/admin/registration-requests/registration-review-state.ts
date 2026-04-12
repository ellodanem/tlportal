/** Shared with client forms and server actions — not a "use server" module. */
export type RegistrationReviewState = {
  error: string | null;
  /** When set after a successful action, the client navigates here (avoids redirect + useActionState edge cases). */
  next: string | null;
};

export const registrationReviewInitialState: RegistrationReviewState = {
  error: null,
  next: null,
};
