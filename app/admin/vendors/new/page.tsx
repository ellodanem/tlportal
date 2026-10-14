import { CommercialCreateShell } from "@/components/admin/commercial-create-shell";
import { VendorForm } from "@/components/admin/vendor-form";

export default function NewVendorPage() {
  return <CommercialCreateShell backHref="/admin/vendors" backLabel="Vendors" eyebrow="Purchases / Vendors" title="New vendor" description="Create a reusable supplier record for expenses and future bills." panelTitle="Build the relationship" panelDescription="A clean vendor record keeps purchases consistent and gives payables a reliable home." panelItems={[{ label: "Best for", value: "Suppliers and service providers" }, { label: "Useful now", value: "Payment terms and currency" }, { label: "Used by", value: "Expenses and bills" }]}><VendorForm /></CommercialCreateShell>;
}
