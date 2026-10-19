import { redirect } from "next/navigation";

/** Canonical subscriptions are the staff default; the prior screen remains at /legacy. */
export default function AdminSubscriptionsPage() {
  redirect("/admin/subscriptions/canonical");
}
