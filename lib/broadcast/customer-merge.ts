import type { BroadcastMergeValues } from "./merge-fields";
import type { BroadcastRecipient } from "./audience";
import { getBroadcastPortalUrl, getBroadcastSupportEmail } from "./support-contact";

export type BroadcastIncidentFields = {
  incidentTitle?: string | null;
  incidentStatus?: string | null;
  incidentEta?: string | null;
};

export async function mergeValuesForRecipient(
  recipient: BroadcastRecipient,
  incident: BroadcastIncidentFields,
): Promise<BroadcastMergeValues> {
  const first = recipient.firstName?.trim() || "there";
  return {
    customer_name: recipient.displayName,
    first_name: first,
    company: recipient.company?.trim() || recipient.displayName,
    support_email: await getBroadcastSupportEmail(),
    portal_url: getBroadcastPortalUrl(),
    incident_title: incident.incidentTitle?.trim() || "Track Lucia service",
    incident_status: incident.incidentStatus?.trim() || "",
    eta: incident.incidentEta?.trim() || "",
  };
}
