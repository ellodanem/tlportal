import type { CreateInvoilessInvoiceItem } from "./invoice-mutate";

export function parseLineItemsFromFormData(
  formData: FormData,
): { items: CreateInvoilessInvoiceItem[] } | { error: string } {
  const names = formData.getAll("itemName").map((v) => String(v ?? "").trim());
  const quantityRaw = formData.getAll("quantity").map((v) => String(v ?? "").trim());
  const priceRaw = formData.getAll("unitPrice").map((v) => String(v ?? "").trim());
  const len = Math.max(names.length, quantityRaw.length, priceRaw.length);
  const items: CreateInvoilessInvoiceItem[] = [];

  for (let i = 0; i < len; i++) {
    const name = names[i] ?? "";
    const qStr = quantityRaw[i] ?? "";
    const pStr = priceRaw[i] ?? "";
    if (!name && !qStr && !pStr) {
      continue;
    }
    if (!name) {
      return { error: `Line ${items.length + 1}: add a description, or remove empty rows.` };
    }
    const quantity = Number(qStr);
    const price = Number(pStr);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        error: `"${name.slice(0, 40)}${name.length > 40 ? "…" : ""}": quantity must be greater than zero.`,
      };
    }
    if (!Number.isFinite(price) || price < 0) {
      return {
        error: `"${name.slice(0, 40)}${name.length > 40 ? "…" : ""}": unit price must be zero or greater.`,
      };
    }
    items.push({ name, quantity, price });
  }

  if (!items.length) {
    return { error: "Add at least one line item with a description, quantity, and unit price." };
  }
  return { items };
}
