import { redirect } from "next/navigation";

import { subscriptionBasePath } from "@/lib/domain/canonical-subscription-navigation";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * A subscription has no overview page of its own: Services is the landing section. This route
 * stays so every existing link, bookmark and post-action redirect to the subscription still
 * works, and it keeps the query string (`?error=`, `?pilot=`) so those messages are not lost.
 */
export default async function CanonicalSubscriptionIndexPage({ params, searchParams }: Props) {
  const [{ subscriptionId }, query] = await Promise.all([params, searchParams]);
  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) forwarded.append(key, entry);
  }
  const suffix = forwarded.size ? `?${forwarded.toString()}` : "";
  redirect(`${subscriptionBasePath(subscriptionId)}/services${suffix}`);
}
