/** Shared with client forms and server actions — not a "use server" module. */
export type SetupCommandActionState = {
  error: string | null;
  /** Changes after a successful create so the add form can clear itself. */
  okId: number | null;
};

export const setupCommandInitialState: SetupCommandActionState = { error: null, okId: null };
