export function customerDisplayName(c: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const co = c.company?.trim();
  if (co) return co;
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return person || "Customer";
}
