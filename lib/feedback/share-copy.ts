export type FeedbackShareInput = {
  body: string;
  displayName: string | null;
  sharePermission: boolean;
};

const QUOTE_MAX = 280;

export function canCopyForShare(sharePermission: boolean): boolean {
  return sharePermission === true;
}

export function canFeatureFeedback(sharePermission: boolean): boolean {
  return sharePermission === true;
}

export function compactQuote(body: string, max = QUOTE_MAX): string {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function formatFeedbackQuote(input: FeedbackShareInput): string | null {
  if (!canCopyForShare(input.sharePermission)) return null;
  const quote = compactQuote(input.body);
  const name = input.displayName?.trim();
  if (name) return `"${quote}" — ${name}`;
  return `"${quote}"`;
}

export function formatFeedbackCaption(input: FeedbackShareInput): string | null {
  if (!canCopyForShare(input.sharePermission)) return null;
  const quote = compactQuote(input.body);
  const name = input.displayName?.trim();
  const attribution = name ? `— ${name}` : "— a Track Lucia customer";
  return ["A note from a Track Lucia customer:", "", `"${quote}"`, attribution].join("\n");
}
