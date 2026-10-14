export type RecurringInvoiceCommitResult =
  | { kind: "not_due" }
  | {
      kind: "invoice";
      invoiceId: string;
      created: boolean;
      shouldDeliver: boolean;
      to: string | null;
      greetingName: string;
    };

export type RecurringInvoiceGenerationResult =
  | { skipped: true; created: false; emailed: false }
  | {
      skipped: false;
      invoiceId: string;
      created: boolean;
      emailed: boolean;
      emailError?: string;
    };

export type RecurringInvoiceCoordinatorDependencies = {
  commit: () => Promise<RecurringInvoiceCommitResult>;
  deliver: (input: {
    invoiceId: string;
    to: string;
    greetingName: string;
  }) => Promise<{ ok: true } | { error: string }>;
  deliverySucceeded: (invoiceId: string, deliveredAt: Date) => Promise<void>;
  deliveryFailed: (invoiceId: string, error: string) => Promise<void>;
  now?: () => Date;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Coordinates the database commit and the external PDF/email side effect.
 * The commit must atomically create/finalize the invoice, claim delivery, and
 * advance the schedule. Delivery happens only after that commit succeeds.
 */
export async function coordinateRecurringInvoiceGeneration(
  dependencies: RecurringInvoiceCoordinatorDependencies,
): Promise<RecurringInvoiceGenerationResult> {
  const committed = await dependencies.commit();
  if (committed.kind === "not_due") {
    return { skipped: true, created: false, emailed: false };
  }

  const base = {
    skipped: false as const,
    invoiceId: committed.invoiceId,
    created: committed.created,
  };

  if (!committed.shouldDeliver) {
    return { ...base, emailed: false };
  }

  if (!committed.to) {
    const message = "No recipient email on schedule or customer.";
    await dependencies.deliveryFailed(committed.invoiceId, message);
    return { ...base, emailed: false, emailError: message };
  }

  let delivery: { ok: true } | { error: string };
  try {
    delivery = await dependencies.deliver({
      invoiceId: committed.invoiceId,
      to: committed.to,
      greetingName: committed.greetingName,
    });
  } catch (error) {
    delivery = { error: errorMessage(error, "Could not send invoice email.") };
  }

  if ("error" in delivery) {
    await dependencies.deliveryFailed(committed.invoiceId, delivery.error);
    return { ...base, emailed: false, emailError: delivery.error };
  }

  try {
    await dependencies.deliverySucceeded(
      committed.invoiceId,
      (dependencies.now ?? (() => new Date()))(),
    );
  } catch (error) {
    return {
      ...base,
      emailed: true,
      emailError: `Email sent, but delivery state could not be recorded: ${errorMessage(error, "Unknown error")}`,
    };
  }

  return { ...base, emailed: true };
}
