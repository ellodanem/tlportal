export function getAuthSecretBytes(): Uint8Array {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

export function isAuthConfigured(): boolean {
  const s = process.env.AUTH_SECRET?.trim();
  return Boolean(s && s.length >= 32);
}
