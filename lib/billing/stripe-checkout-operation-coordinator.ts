export type CheckoutOperationSnapshot = {
  id: string;
  operationKey: string;
  customerSubscriptionId: string;
  providerReference: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
};

export type CheckoutProviderSession = {
  id: string;
  status: "open" | "complete" | "expired";
  url: string | null;
  subscriptionReference: string | null;
};

export type PreparedCheckoutOperation = {
  operation: CheckoutOperationSnapshot;
  supersededProviderReference?: string | null;
};

export type CheckoutOperationCoordinatorDependencies = {
  prepare: () => Promise<PreparedCheckoutOperation>;
  replaceExpired: (operationId: string) => Promise<CheckoutOperationSnapshot>;
  beginAttempt: (operationId: string) => Promise<void>;
  retrieveSession: (providerReference: string) => Promise<CheckoutProviderSession>;
  recoverSession: (
    operationKey: string,
    customerSubscriptionId: string,
  ) => Promise<CheckoutProviderSession | null>;
  createSession: (idempotencyKey: string, operationKey: string) => Promise<CheckoutProviderSession>;
  expireSession: (providerReference: string, idempotencyKey: string) => Promise<CheckoutProviderSession>;
  recordProviderSession: (operationId: string, session: CheckoutProviderSession) => Promise<void>;
  markRetryRequired: (operationId: string, code: string, message: string) => Promise<void>;
  now?: () => Date;
};

export type CheckoutOperationResult =
  | { ok: true; url: string; sessionId: string; operationKey: string; reused: boolean }
  | { ok: false; error: string; conflict: boolean; operationKey?: string };

export function checkoutCompletionRequiresReconciliation(input: {
  operationWasSuperseded: boolean;
  anotherActiveSubscriptionExists: boolean;
}): boolean {
  return input.operationWasSuperseded || input.anotherActiveSubscriptionExists;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Stripe Checkout operation failed.";
}

function createIdempotencyKey(operationKey: string): string {
  return `tl-checkout:${operationKey}`;
}

function expireIdempotencyKey(operationKey: string): string {
  return `tl-checkout-expire:${operationKey}`;
}

async function resolveExistingSession(
  deps: CheckoutOperationCoordinatorDependencies,
  operation: CheckoutOperationSnapshot,
  session: CheckoutProviderSession,
  reused: boolean,
): Promise<CheckoutOperationResult | "replace"> {
  await deps.recordProviderSession(operation.id, session);
  if (session.status === "open" && session.url) {
    return {
      ok: true,
      url: session.url,
      sessionId: session.id,
      operationKey: operation.operationKey,
      reused,
    };
  }
  if (session.status === "complete") {
    const message = "This Checkout Session already completed and is awaiting billing reconciliation.";
    await deps.markRetryRequired(operation.id, "CHECKOUT_ALREADY_COMPLETED", message);
    return { ok: false, error: message, conflict: true, operationKey: operation.operationKey };
  }
  return "replace";
}

/**
 * Coordinates a durable logical Checkout activation with Stripe's provider
 * idempotency. Database preparation/replacement must serialize per customer.
 */
export async function coordinateStripeCheckoutOperation(
  deps: CheckoutOperationCoordinatorDependencies,
): Promise<CheckoutOperationResult> {
  const prepared = await deps.prepare();
  let operation = prepared.operation;

  if (prepared.supersededProviderReference) {
    try {
      const expired = await deps.expireSession(
        prepared.supersededProviderReference,
        expireIdempotencyKey(operation.operationKey),
      );
      if (expired.status === "complete") {
        const message = "An older Checkout Session completed while it was being replaced. Reconciliation is required.";
        await deps.markRetryRequired(operation.id, "SUPERSEDED_CHECKOUT_COMPLETED", message);
        return { ok: false, error: message, conflict: true, operationKey: operation.operationKey };
      }
    } catch (error) {
      const message = `Could not safely expire the previous Checkout Session: ${errorMessage(error)}`;
      await deps.markRetryRequired(operation.id, "SUPERSEDE_FAILED", message);
      return { ok: false, error: message, conflict: false, operationKey: operation.operationKey };
    }
  }

  for (let replacements = 0; replacements < 2; replacements += 1) {
    try {
      if (operation.providerReference) {
        const existing = await deps.retrieveSession(operation.providerReference);
        const resolved = await resolveExistingSession(deps, operation, existing, true);
        if (resolved !== "replace") return resolved;
        operation = await deps.replaceExpired(operation.id);
        continue;
      }

      const recovered = await deps.recoverSession(
        operation.operationKey,
        operation.customerSubscriptionId,
      );
      if (recovered) {
        const resolved = await resolveExistingSession(deps, operation, recovered, true);
        if (resolved !== "replace") return resolved;
        operation = await deps.replaceExpired(operation.id);
        continue;
      }

      const now = (deps.now ?? (() => new Date()))();
      if (
        operation.attemptCount > 0
        && operation.lastAttemptAt
        && operation.lastAttemptAt.getTime() <= now.getTime() - 23 * 60 * 60 * 1000
      ) {
        const message = "The prior Stripe request is older than the safe idempotency recovery window and no matching Session was found. Manual reconciliation is required.";
        await deps.markRetryRequired(operation.id, "IDEMPOTENCY_WINDOW_EXPIRED", message);
        return { ok: false, error: message, conflict: true, operationKey: operation.operationKey };
      }

      await deps.beginAttempt(operation.id);
      const created = await deps.createSession(
        createIdempotencyKey(operation.operationKey),
        operation.operationKey,
      );
      const resolved = await resolveExistingSession(deps, operation, created, false);
      if (resolved !== "replace") return resolved;
      operation = await deps.replaceExpired(operation.id);
    } catch (error) {
      const message = errorMessage(error);
      await deps.markRetryRequired(operation.id, "PROVIDER_REQUEST_UNCERTAIN", message);
      return { ok: false, error: message, conflict: false, operationKey: operation.operationKey };
    }
  }

  const message = "Checkout Session replacement limit reached. Reconciliation is required.";
  await deps.markRetryRequired(operation.id, "REPLACEMENT_LIMIT", message);
  return { ok: false, error: message, conflict: true, operationKey: operation.operationKey };
}
