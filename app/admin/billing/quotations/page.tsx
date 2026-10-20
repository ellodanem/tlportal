import { BillingWorkspace } from "@/components/admin/billing-workspace";

export default async function BillingQuotationsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  return <BillingWorkspace view="quotations" searchParams={await searchParams} />;
}
