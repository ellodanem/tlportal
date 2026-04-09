/** Must match Management API host (`lib/nce/client.ts`). The portal subdomain returns HTML 404 for this path. */
const TOKEN_URL = "https://api.1nce.com/management-api/oauth/token";

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

let cached: { token: string; expiresAt: number } | null = null;

export class OneNceConfigError extends Error {
  constructor(message = "ONCE_CLIENT_ID / ONCE_CLIENT_SECRET are not set") {
    super(message);
    this.name = "OneNceConfigError";
  }
}

function getCredentials(): { id: string; secret: string } {
  const id = process.env.ONCE_CLIENT_ID?.trim();
  const secret = process.env.ONCE_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new OneNceConfigError();
  }
  return { id, secret };
}

/**
 * OAuth2 client-credentials access token for the 1NCE Management API.
 * Caches until shortly before expiry.
 */
export async function getOneNceAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30_000) {
    return cached.token;
  }

  const { id, secret } = getCredentials();
  /** 1NCE requires HTTP Basic (client_id:client_secret), not only form body fields. */
  const basic = Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const text = await res.text();
  let json: TokenResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as TokenResponse) : null;
  } catch {
    // ignore
  }

  if (!res.ok || !json?.access_token) {
    throw new Error(
      `1NCE token ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  const expiresInMs = (json.expires_in ?? 3600) * 1000;
  cached = {
    token: json.access_token,
    expiresAt: now + expiresInMs,
  };
  return json.access_token;
}

export function clearOneNceTokenCache(): void {
  cached = null;
}
