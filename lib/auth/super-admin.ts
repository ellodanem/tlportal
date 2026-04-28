import "server-only";

import { DEFAULT_SUPER_ADMIN_EMAIL } from "./constants";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getDefaultSuperAdminEmail(): string {
  const envEmail = process.env.SUPER_ADMIN_EMAIL?.trim();
  return normalizeEmail(envEmail || DEFAULT_SUPER_ADMIN_EMAIL);
}

export function isSuperAdminEmail(email: string): boolean {
  return normalizeEmail(email) === getDefaultSuperAdminEmail();
}
