"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  createPortalUserAction,
  deletePortalUserAction,
  updatePortalUserAction,
  type PortalUserFormState,
} from "@/app/admin/customers/portal-user-actions";
import { CopyValueButton } from "@/components/admin/copy-value-button";

export type PortalUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  traqcareUsername: string | null;
  hasPassword: boolean;
  traqcarePassword: string | null;
  role: string | null;
  notes: string | null;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

const labelClass = "block text-xs font-medium text-zinc-600 dark:text-zinc-400";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function PortalUserFields({
  defaults,
  hasStoredPassword = false,
  idPrefix,
}: {
  defaults?: Partial<PortalUserRow>;
  hasStoredPassword?: boolean;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-name`}>
          Name
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={defaults?.name ?? ""}
          className={`mt-1 ${inputClass}`}
          placeholder="Person’s name"
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-role`}>
          Role
        </label>
        <input
          id={`${idPrefix}-role`}
          name="role"
          defaultValue={defaults?.role ?? ""}
          className={`mt-1 ${inputClass}`}
          placeholder="e.g. owner, dispatcher"
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-email`}>
          Email
        </label>
        <input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          defaultValue={defaults?.email ?? ""}
          className={`mt-1 ${inputClass}`}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-phone`}>
          Phone / WhatsApp
        </label>
        <input
          id={`${idPrefix}-phone`}
          name="phone"
          defaultValue={defaults?.phone ?? ""}
          className={`mt-1 ${inputClass}`}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-username`}>
          Traqcare username
        </label>
        <input
          id={`${idPrefix}-username`}
          name="traqcareUsername"
          autoComplete="off"
          defaultValue={defaults?.traqcareUsername ?? ""}
          className={`mt-1 ${inputClass}`}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-password`}>
          Traqcare password
        </label>
        <input
          id={`${idPrefix}-password`}
          name="traqcarePassword"
          type="password"
          autoComplete="new-password"
          className={`mt-1 ${inputClass}`}
          placeholder={hasStoredPassword ? "Leave blank to keep current" : "Optional"}
        />
        {hasStoredPassword ? (
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" name="traqcarePasswordClear" value="1" className="mt-0.5 rounded border-zinc-300" />
            <span>Remove stored password</span>
          </label>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor={`${idPrefix}-notes`}>
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          className={`mt-1 ${inputClass}`}
        />
      </div>
    </div>
  );
}

function AddPortalUserForm({ customerId }: { customerId: string }) {
  const [state, action] = useActionState(createPortalUserAction, {} as PortalUserFormState);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Add portal user</p>
      <PortalUserFields idPrefix={`add-${customerId}`} />
      {state.error ? <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p> : null}
      {state.ok && state.message ? <p className="text-sm text-emerald-800 dark:text-emerald-400">{state.message}</p> : null}
      <SubmitButton label="Add user" pendingLabel="Adding…" />
    </form>
  );
}

function EditPortalUserForm({
  customerId,
  user,
  onDone,
}: {
  customerId: string;
  user: PortalUserRow;
  onDone: () => void;
}) {
  const [state, action] = useActionState(updatePortalUserAction, {} as PortalUserFormState);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (state.ok) {
      onDoneRef.current();
    }
  }, [state.ok]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={user.id} />
      <input type="hidden" name="customerId" value={customerId} />
      <PortalUserFields
        idPrefix={`edit-${user.id}`}
        defaults={user}
        hasStoredPassword={user.hasPassword}
      />
      {state.error ? <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton label="Save" pendingLabel="Saving…" />
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white p-1 text-zinc-500 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {children}
    </button>
  );
}

function CopyLoginButton({ username, password }: { username: string; password: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const value = `${username}\n${password}`;
  const title =
    status === "copied"
      ? "Username and password copied"
      : status === "error"
        ? "Could not copy login"
        : "Copy username and password";

  return (
    <button
      type="button"
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("copied");
            window.setTimeout(() => setStatus("idle"), 2000);
          } catch {
            setStatus("error");
            window.setTimeout(() => setStatus("idle"), 2000);
          }
        })();
      }}
      title={title}
      aria-label={title}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {status === "copied" ? "Copied login" : "Copy login"}
    </button>
  );
}

function PortalUserCard({ customerId, user }: { customerId: string; user: PortalUserRow }) {
  const [editing, setEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const title = user.name?.trim() || user.traqcareUsername?.trim() || user.email?.trim() || "Portal user";
  const username = user.traqcareUsername?.trim() ?? "";
  const password = user.traqcarePassword ?? "";
  const canCopyLogin = Boolean(username && user.hasPassword && password);

  if (editing) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-zinc-900">
        <p className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">Edit {title}</p>
        <EditPortalUserForm customerId={customerId} user={user} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div>
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
            {user.role?.trim() ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{user.role.trim()}</p>
            ) : null}
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Email</dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{user.email?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Phone</dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{user.phone?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Username</dt>
              <dd className="mt-0.5 flex items-center gap-1 text-zinc-800 dark:text-zinc-200">
                <span className="min-w-0 truncate">{username || "—"}</span>
                {username ? <CopyValueButton value={username} kind="username" /> : null}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Password</dt>
              <dd className="mt-0.5 flex min-w-0 items-center gap-1 text-zinc-800 dark:text-zinc-200">
                {user.hasPassword && password ? (
                  <>
                    <span className="min-w-0 truncate font-mono text-xs">
                      {showPassword ? password : "••••••••"}
                    </span>
                    <IconButton
                      title={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="stroke-current">
                          <path
                            d="M3 3l18 18M10.6 10.6a2 2 0 102.8 2.8M9.9 5.1A10.5 10.5 0 0121 12c-.6 1.1-1.4 2.1-2.4 3M6.1 6.1A10.4 10.4 0 003 12c1.7 3.4 5.1 6 9 6 1.3 0 2.5-.3 3.6-.7"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="stroke-current">
                          <path
                            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <circle cx="12" cy="12" r="3" strokeWidth="2" />
                        </svg>
                      )}
                    </IconButton>
                    <CopyValueButton value={password} kind="password" />
                  </>
                ) : (
                  <span>—</span>
                )}
              </dd>
            </div>
          </dl>
          {user.notes?.trim() ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{user.notes.trim()}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canCopyLogin ? <CopyLoginButton username={username} password={password} /> : null}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Edit
          </button>
          <form action={deletePortalUserAction}>
            <input type="hidden" name="id" value={user.id} />
            <input type="hidden" name="customerId" value={customerId} />
            <button
              type="submit"
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40"
              onClick={(e) => {
                if (!window.confirm(`Remove portal user “${title}”?`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function CustomerPortalUsersPanel({
  customerId,
  users,
  showTopBorder = true,
}: {
  customerId: string;
  users: PortalUserRow[];
  /** When false, omit the top border (e.g. standalone edit-page card). */
  showTopBorder?: boolean;
}) {
  return (
    <div
      className={`space-y-3 ${showTopBorder ? "mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800" : ""}`}
    >
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Portal users</h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          People with Traqcare logins for this customer. Client ID and portal URL above are shared by the fleet.
          Passwords are stored as plain text — limit who can access this admin app.
        </p>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No portal users yet.</p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <PortalUserCard key={user.id} customerId={customerId} user={user} />
          ))}
        </div>
      )}

      <AddPortalUserForm key={users.map((u) => u.id).join(",")} customerId={customerId} />
    </div>
  );
}
