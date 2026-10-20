import { BillingWorkspace } from "@/components/admin/billing-workspace";

export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; currency?: string }> }) {
  return <BillingWorkspace view="invoices" searchParams={await searchParams} />;
}
