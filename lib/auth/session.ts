import { SignJWT, jwtVerify } from "jose";

import { getAuthSecretBytes } from "./env";

export type SessionPayload = {
  sub: string;
  email: string;
};

/** Must match `middleware.ts` (Edge) — duplicated there; do not import this file from middleware. */
const ISS = "tl-portal";
const AUD = "admin";

export async function signSession(payload: SessionPayload, maxAgeSec = 60 * 60 * 24 * 7): Promise<string> {
  const secret = getAuthSecretBytes();
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getAuthSecretBytes();
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISS,
      audience: AUD,
      algorithms: ["HS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!sub || !email) {
      return null;
    }
    return { sub, email };
  } catch {
    return null;
  }
}
