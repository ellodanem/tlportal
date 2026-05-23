/**
 * Traqcare `clientid` for GET /live — fleet-level, usually one per TL customer.
 * Device link `externalAccountRef` may override when a unit sits under a different fleet.
 */
export function resolveTraqcareClientId(params: {
  customerClientId?: string | null;
  linkAccountRef?: string | null;
}): string | null {
  const override = params.linkAccountRef?.trim();
  if (override) {
    return override;
  }
  const customer = params.customerClientId?.trim();
  return customer || null;
}
