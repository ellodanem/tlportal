import { verifyInvoilessWebhookSignature } from "@/lib/invoiless/verify-webhook-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Last POST (in-memory; resets when the dev server / lambda cold-starts). */
export type InvoilessWebhookLast = {
  receivedAt: string;
  /** Parsed `type` from JSON body when present. */
  type: string | null;
  /** Parsed `data` from JSON body (opaque). */
  data: unknown;
  /** First ~4k chars of raw body for diffing signatures vs parsers. */
  rawBodyPreview: string;
  invoilessSignature: string | null;
  /** `true` / `false` when a secret was configured; `null` when verification was skipped (no secret). */
  signatureVerified: boolean | null;
};

let lastInbound: InvoilessWebhookLast | undefined;

function webhookSecret(): string | null {
  const a = process.env.INVOILESS_WEBHOOK_SECRET?.trim();
  if (a) return a;
  /** Docs example name — optional alias. */
  return process.env.INVOILESS_SECRET?.trim() || null;
}

function debugToken(): string | null {
  return process.env.INVOILESS_WEBHOOK_DEBUG_TOKEN?.trim() || null;
}

function debugAuthOk(req: Request): boolean {
  const token = debugToken();
  if (!token) return false;
  const h = req.headers.get("x-tl-webhook-debug");
  if (h === token) return true;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7).trim() === token) return true;
  return false;
}

/**
 * POST — Invoiless webhooks (invoice, recurring, etc.).
 * Configure URL in Invoiless: `https://<host>/api/webhooks/invoiless`
 *
 * - Set `INVOILESS_WEBHOOK_SECRET` to the secret from Invoiless webhook settings (signatures required).
 * - Leave secret unset only for quick local experiments (signatures are not verified).
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("invoiless-signature");
  const secret = webhookSecret();

  let signatureVerified: boolean | null = null;
  if (secret) {
    const ok = verifyInvoilessWebhookSignature(rawBody, sigHeader, secret);
    signatureVerified = ok;
    if (!ok) {
      return new Response("Invalid or missing invoiless-signature", { status: 401 });
    }
  }

  let parsed: { type?: unknown; data?: unknown } | null = null;
  try {
    parsed = JSON.parse(rawBody) as { type?: unknown; data?: unknown };
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const type = typeof parsed?.type === "string" ? parsed.type : null;
  const data = parsed?.data !== undefined ? parsed.data : undefined;

  lastInbound = {
    receivedAt: new Date().toISOString(),
    type,
    data: data !== undefined ? data : parsed,
    rawBodyPreview: rawBody.length > 4000 ? `${rawBody.slice(0, 4000)}…` : rawBody,
    invoilessSignature: sigHeader,
    signatureVerified,
  };

  if (process.env.NODE_ENV !== "production") {
    console.info("[invoiless webhook]", JSON.stringify({ type, hasData: data !== undefined }));
  }

  return Response.json({ ok: true }, { status: 200 });
}

/**
 * GET — Inspect the last webhook body (local debugging).
 * Requires `INVOILESS_WEBHOOK_DEBUG_TOKEN` as header `x-tl-webhook-debug` or `Authorization: Bearer …`.
 * In development, if the token is unset, returns the last payload anyway (do not use in production).
 */
export async function GET(req: Request) {
  const dev = process.env.NODE_ENV !== "production";
  if (!dev && !debugAuthOk(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (dev && !debugToken()) {
    return Response.json({
      last: lastInbound ?? null,
      hint:
        "No INVOILESS_WEBHOOK_DEBUG_TOKEN: showing last payload in dev only. Set the token to require auth in dev too.",
    });
  }
  if (!debugAuthOk(req)) {
    return Response.json(
      {
        error: "Missing or invalid debug token",
        hint: "Send header x-tl-webhook-debug: <INVOILESS_WEBHOOK_DEBUG_TOKEN> or Authorization: Bearer <token>",
      },
      { status: 401 },
    );
  }
  return Response.json({ last: lastInbound ?? null });
}
