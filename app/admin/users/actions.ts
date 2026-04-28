"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isSuperAdminEmail, normalizeEmail } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || !isSuperAdminEmail(session.email)) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function createUserAction(formData: FormData) {
  await requireSuperAdmin();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");

  if (!email || !password || password.length < 8) {
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });

  revalidatePath("/admin/users");
}

export async function resetUserPasswordAction(formData: FormData) {
  await requireSuperAdmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId || !password || password.length < 8) {
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  revalidatePath("/admin/users");
}

export async function deleteUserAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return;
  if (isSuperAdminEmail(user.email)) return;
  if (session.sub === user.id) return;

  await prisma.user.delete({ where: { id: user.id } });
  revalidatePath("/admin/users");
}

export async function changeOwnPasswordAction(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (!currentPassword || !newPassword || newPassword.length < 8) return;

  const me = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, passwordHash: true },
  });
  if (!me) return;

  const ok = await verifyPassword(currentPassword, me.passwordHash);
  if (!ok) return;

  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  revalidatePath("/admin/users");
}
