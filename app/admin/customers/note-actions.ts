"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";

export type CustomerNoteActionState = { error: string | null; ok?: boolean };

export async function addCustomerNoteAction(
  _prev: CustomerNoteActionState,
  formData: FormData,
): Promise<CustomerNoteActionState> {
  const session = await getSession();
  if (!session) return { error: "You must be signed in." };

  const customerId = String(formData.get("customerId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!customerId) return { error: "Missing customer." };
  if (!note) return { error: "Write a note before saving." };
  if (note.length > 4000) return { error: "Keep notes under 4,000 characters." };

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) return { error: "Customer not found." };

  await recordOperationalEvent({
    category: "staff.note",
    summary: "Internal note added",
    customerId,
    actorUserId: session.sub,
    payload: { note },
  });

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/activity`);
  return { error: null, ok: true };
}
