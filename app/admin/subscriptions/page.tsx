import { redirect } from "next/navigation";

/** Removed — device expand + mark paid live on Customers. */
export default function AdminSubscriptionsRedirectPage() {
  redirect("/admin/customers");
}
