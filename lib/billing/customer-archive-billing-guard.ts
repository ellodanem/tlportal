export type ActiveBillingArrangementCounts = {
  stripeSubscriptions: number;
  recurringSchedules: number;
  unresolvedCheckoutOperations: number;
  stripeAccountsWithoutLocalSubscription: number;
};

export function customerArchiveBillingBlockReason(
  counts: ActiveBillingArrangementCounts,
): string | null {
  const parts: string[] = [];
  if (counts.stripeSubscriptions > 0) {
    parts.push(`${counts.stripeSubscriptions} active or unresolved Stripe subscription${counts.stripeSubscriptions === 1 ? "" : "s"}`);
  }
  if (counts.recurringSchedules > 0) {
    parts.push(`${counts.recurringSchedules} active or paused recurring invoice schedule${counts.recurringSchedules === 1 ? "" : "s"}`);
  }
  if (counts.unresolvedCheckoutOperations > 0) {
    parts.push(`${counts.unresolvedCheckoutOperations} unresolved Stripe Checkout operation${counts.unresolvedCheckoutOperations === 1 ? "" : "s"}`);
  }
  if (counts.stripeAccountsWithoutLocalSubscription > 0) {
    parts.push("a Stripe billing account with an unresolved provider status");
  }
  if (parts.length === 0) return null;
  return `Customer cannot be archived while billing remains active: ${parts.join(", ")}. Resolve or cancel billing first; TL Portal did not change Stripe.`;
}
