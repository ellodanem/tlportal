export type FeedbackFormState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | { ok: null };

export const feedbackFormInitialState: FeedbackFormState = { ok: null };
