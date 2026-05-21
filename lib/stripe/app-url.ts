import "server-only";

/** Base URL for Checkout success/cancel and Customer Portal return (no trailing slash). */
export function getAppBaseUrl(): string {
  const explicit =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (explicit) {
    const withProto = explicit.startsWith("http") ? explicit : `https://${explicit}`;
    return withProto.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}
