import type { FeedbackStatus, Prisma } from "@prisma/client";

export type FeedbackListFilter = "new" | "featured" | "private" | "all";

export function parseFeedbackListFilter(raw: string | undefined): FeedbackListFilter {
  if (raw === "featured" || raw === "private" || raw === "all") return raw;
  return "new";
}

export function feedbackListWhere(filter: FeedbackListFilter): Prisma.FeedbackSubmissionWhereInput {
  switch (filter) {
    case "featured":
      return { status: "featured" };
    case "private":
      return { sharePermission: false };
    case "all":
      return {};
    default:
      return { status: "inbox" };
  }
}

export function feedbackStatusLabel(status: FeedbackStatus): string {
  switch (status) {
    case "inbox":
      return "New";
    case "reviewed":
      return "Reviewed";
    case "featured":
      return "Featured";
    case "archived":
      return "Archived";
  }
}

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return value === "inbox" || value === "reviewed" || value === "featured" || value === "archived";
}
