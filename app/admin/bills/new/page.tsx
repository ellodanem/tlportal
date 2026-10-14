import { VendorBillForm, type BillVendorOption } from "@/components/admin/vendor-bill-form";
import { CommercialCreateShell } from "@/components/admin/commercial-create-shell";
import { prisma } from "@/lib/db";

export default async function NewVendorBillPage() {
  const vendors = await prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, paymentTerms: true } });
  return <CommercialCreateShell backHref="/admin/bills" backLabel="Vendor bills" eyebrow="Purchases / Bills" title="New vendor bill" description="Record a supplier invoice and track the balance until it is paid." panelTitle="Track what is owed" panelDescription="Bills begin as drafts, then move through open, partial, overdue, and paid states as payments are recorded." panelItems={[{ label: "Best for", value: "Supplier invoices" }, { label: "Required", value: "Vendor, total, and bill date" }, { label: "Next step", value: "Record payment when settled" }]}><VendorBillForm vendors={vendors as BillVendorOption[]} /></CommercialCreateShell>;
}
