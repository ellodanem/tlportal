import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE } from "./constants";
import { verifySessionToken } from "./session";
import type { SessionPayload } from "./session";

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  return verifySessionToken(raw);
}
