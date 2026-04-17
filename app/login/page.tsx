"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError(null);
    setPending(true);
    // #region agent log
    fetch("http://127.0.0.1:7737/ingest/ec438a6c-7ff8-4ec8-81eb-94e4c82e0396", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "79eeac" },
      body: JSON.stringify({
        sessionId: "79eeac",
        location: "app/login/page.tsx:signIn",
        message: "submit_start",
        data: { hasEmail: Boolean(email?.trim()), hasPassword: Boolean(password?.length), rememberMe },
        timestamp: Date.now(),
        hypothesisId: "H1",
        runId: "pre-fix",
      }),
    }).catch(() => {});
    // #endregion
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
        credentials: "same-origin",
      });
      // #region agent log
      fetch("http://127.0.0.1:7737/ingest/ec438a6c-7ff8-4ec8-81eb-94e4c82e0396", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "79eeac" },
        body: JSON.stringify({
          sessionId: "79eeac",
          location: "app/login/page.tsx:afterFetch",
          message: "login_response",
          data: { status: res.status, ok: res.ok },
          timestamp: Date.now(),
          hypothesisId: "H1",
          runId: "pre-fix",
        }),
      }).catch(() => {});
      // #endregion
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Login failed (${res.status})`);
        return;
      }
      // #region agent log
      fetch("http://127.0.0.1:7737/ingest/ec438a6c-7ff8-4ec8-81eb-94e4c82e0396", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "79eeac" },
        body: JSON.stringify({
          sessionId: "79eeac",
          location: "app/login/page.tsx:beforeNav",
          message: "will_navigate_admin",
          data: { method: "location.assign" },
          timestamp: Date.now(),
          hypothesisId: "H5",
          runId: "post-fix",
        }),
      }).catch(() => {});
      // #endregion
      window.location.assign("/admin");
    } catch {
      // #region agent log
      fetch("http://127.0.0.1:7737/ingest/ec438a6c-7ff8-4ec8-81eb-94e4c82e0396", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "79eeac" },
        body: JSON.stringify({
          sessionId: "79eeac",
          location: "app/login/page.tsx:catch",
          message: "fetch_or_json_failed",
          data: {},
          timestamp: Date.now(),
          hypothesisId: "H1",
          runId: "pre-fix",
        }),
      }).catch(() => {});
      // #endregion
      setError("Network error — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void signIn();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Track Lucia
        </p>
        <h1 className="mt-1 text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          TL Portal
        </h1>
        <p className="mt-1 text-center text-sm text-zinc-500">Admin sign in</p>

        {/* No method/action: never navigate to /login via GET (?email=) or POST /login — only fetch /api/auth/login */}
        <form className="mt-6 space-y-4" onSubmit={onFormSubmit}>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300" htmlFor="remember-me">
            <input
              id="remember-me"
              name="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
            />
            Remember me
          </label>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => void signIn()}
            className="flex w-full justify-center rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
