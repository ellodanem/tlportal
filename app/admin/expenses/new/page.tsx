import { ExpenseForm, type ExpenseCategoryOption, type ExpenseCustomerOption, type ExpenseDeviceOption, type ExpenseVendorOption } from "@/components/admin/expense-form";
import { CommercialCreateShell } from "@/components/admin/commercial-create-shell";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";

async function loadFormOptions() {
  const [categories, vendors, customers, devices] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: activeCustomerWhere, orderBy: [{ company: "asc" }, { lastName: "asc" }], select: { id: true, company: true, firstName: true, lastName: true } }),
    prisma.device.findMany({ orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, label: true, imei: true } }),
  ]);
  return { categories: categories as ExpenseCategoryOption[], vendors: vendors as ExpenseVendorOption[], customers: customers.map((c) => ({ id: c.id, label: customerDisplayName(c) })) as ExpenseCustomerOption[], devices: devices.map((d) => ({ id: d.id, label: d.label?.trim() || d.imei })) as ExpenseDeviceOption[] };
}

export default async function NewExpensePage() {
  const { categories, vendors, customers, devices } = await loadFormOptions();
  return <CommercialCreateShell backHref="/admin/expenses" backLabel="Expenses" eyebrow="Purchases / Expenses" title="New expense" description="Record a vendor payment with optional receipt upload and customer or device attribution." panelTitle="Capture it once" panelDescription="Keep the spend record useful later by attaching the right vendor, category, and receipt." panelItems={[{ label: "Best for", value: "Paid operational costs" }, { label: "Recommended", value: "Attach a receipt and category" }, { label: "Next step", value: "Review in Expenses" }]}><ExpenseForm categories={categories} vendors={vendors} customers={customers} devices={devices} /></CommercialCreateShell>;
}
