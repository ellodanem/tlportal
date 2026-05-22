import type { BroadcastCampaignStatus } from "@prisma/client";

const LABELS: Record<BroadcastCampaignStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function broadcastCampaignStatusLabel(status: BroadcastCampaignStatus): string {
  return LABELS[status] ?? status;
}

export function broadcastCampaignStatusTone(
  status: BroadcastCampaignStatus,
): "neutral" | "progress" | "success" | "warning" | "error" {
  switch (status) {
    case "queued":
    case "sending":
      return "progress";
    case "completed":
      return "success";
    case "completed_with_errors":
      return "warning";
    case "failed":
    case "cancelled":
      return "error";
    default:
      return "neutral";
  }
}
