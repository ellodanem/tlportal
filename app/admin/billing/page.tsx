import { redirect } from "next/navigation";

/** Legacy billing ops route → Customers. */
export default function AdminBillingRedirectPage() {
  redirect("/admin/customers");
}
