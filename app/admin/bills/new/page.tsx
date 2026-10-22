import { VendorBillForm, type BillVendorOption } from "@/components/admin/vendor-bill-form";
import { CommercialCreateShell } from "@/components/admin/commercial-create-shell";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";

export default async function NewVendorBillPage() {
  const [vendors, categories, customers, devices] = await Promise.all([
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, paymentTerms: true } }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: activeCustomerWhere, orderBy: [{ company: "asc" }, { lastName: "asc" }], select: { id: true, company: true, firstName: true, lastName: true } }),
    prisma.device.findMany({ orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, label: true, imei: true } }),
  ]);
  return <CommercialCreateShell backHref="/admin/bills" backLabel="Expenses" eyebrow="Purchases / Expenses" title="New expense" description="Record a purchase once, then mark it paid now or leave it unpaid for later." panelTitle="One expense ledger" panelDescription="Receipts, categories, attribution, balances, and payment history stay on the same record." panelItems={[{ label: "Status", value: "Paid or unpaid" }, { label: "Required", value: "Vendor, total, and date" }, { label: "Optional", value: "Receipt and attribution" }]}><VendorBillForm vendors={vendors as BillVendorOption[]} categories={categories} customers={customers.map((item) => ({ id: item.id, label: customerDisplayName(item) }))} devices={devices.map((item) => ({ id: item.id, label: item.label?.trim() || item.imei }))} /></CommercialCreateShell>;
}
