"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import {
  getInvoilessBackfillStatus,
  importInvoilessInvoicesBatch,
  type InvoilessBackfillBatchResult,
} from "@/lib/services/invoiless-backfill-service";

export type BackfillActionState = {
  error?: string;
  result?: InvoilessBackfillBatchResult;
};

export async function runInvoilessBackfillBatchAction(
  _prev: BackfillActionState,
  formData: FormData,
): Promise<BackfillActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Sign in required." };
  }

  const page = Math.max(1, parseInt(String(formData.get("page") ?? "1"), 10) || 1);

  try {
    const result = await importInvoilessInvoicesBatch({ page, limit: 25 });
    revalidatePath("/admin/billing-cutover");
    revalidatePath("/admin/tl-invoices");
    revalidatePath("/admin/reports");
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed." };
  }
}

export async function loadBillingCutoverPageData() {
  return getInvoilessBackfillStatus();
}
