import { redirect } from "next/navigation";

/** The subscription workspace is the staff default; the prior screen remains at /legacy. */
export default function AdminSubscriptionsPage() {
  redirect("/admin/subscriptions/canonical");
}
