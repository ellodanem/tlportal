import { permanentRedirect } from "next/navigation";

import { customerBillingPath } from "@/lib/admin/customer-billing-path";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Customer billing moved into the Subscriptions area. This URL stays only so existing
 * bookmarks, emails, WhatsApp alerts and Stripe return links keep working; the query string
 * (for example `?setup=1` or `?stripe=success`) is carried across.
 */
export default async function LegacyCustomerBillingRedirect({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) for (const entry of value) qs.append(key, entry);
  }
  const suffix = qs.toString();
  permanentRedirect(suffix ? `${customerBillingPath(id)}?${suffix}` : customerBillingPath(id));
}
