export type RenewalActionState = {
  error: string | null;
  message?: string;
};

export const renewalActionInitialState: RenewalActionState = { error: null };
