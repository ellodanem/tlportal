"use client";

import { useActionState } from "react";

import {
  createCustomerContactAction,
  deleteCustomerContactAction,
  type CustomerContactActionState,
} from "@/app/admin/customers/contact-actions";

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
  isBillingContact: boolean;
  isOperationsContact: boolean;
  isMessageContact: boolean;
};

const initial: CustomerContactActionState = { error: null };
const inputClass = "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function ContactBadges({ contact }: { contact: Contact }) {
  const labels = [
    contact.isBillingContact ? "Billing" : null,
    contact.isOperationsContact ? "Operations" : null,
    contact.isMessageContact ? "Messages" : null,
  ].filter(Boolean) as string[];
  return labels.length ? (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {labels.map((label) => <span key={label} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">{label}</span>)}
    </div>
  ) : null;
}

export function CustomerContactsPanel({ customerId, contacts }: { customerId: string; contacts: Contact[] }) {
  const [state, formAction] = useActionState(createCustomerContactAction, initial);

  return (
    <div className="space-y-6">
      {contacts.length ? (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <article key={contact.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{contact.name || "Unnamed contact"}</h3>
                  {contact.role ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{contact.role}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {contact.email ? <a href={`mailto:${contact.email}`} className="hover:text-emerald-700 dark:hover:text-emerald-400">{contact.email}</a> : null}
                    {contact.phone ? <a href={`tel:${contact.phone}`} className="hover:text-emerald-700 dark:hover:text-emerald-400">{contact.phone}</a> : null}
                  </div>
                  <ContactBadges contact={contact} />
                  {contact.notes ? <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500 dark:text-zinc-400">{contact.notes}</p> : null}
                </div>
                <form action={deleteCustomerContactAction}>
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="contactId" value={contact.id} />
                  <button type="submit" className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-400">Remove</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">No additional contacts yet.</p>}

      <form action={formAction} className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <input type="hidden" name="customerId" value={customerId} />
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add contact</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Keep billing, operations, and message recipients attached to the account.</p>
        </div>
        {state.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Name<input name="name" className={inputClass} placeholder="Jane Doe" /></label>
          <label className="text-sm font-medium">Role<input name="role" className={inputClass} placeholder="Billing manager" /></label>
          <label className="text-sm font-medium">Email<input name="email" type="email" className={inputClass} /></label>
          <label className="text-sm font-medium">Phone<input name="phone" type="tel" className={inputClass} /></label>
        </div>
        <label className="block text-sm font-medium">Notes<textarea name="notes" rows={2} className={inputClass} /></label>
        <div className="flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
          <label className="flex items-center gap-2"><input type="checkbox" name="isBillingContact" value="1" /> Billing</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="isOperationsContact" value="1" /> Operations</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="isMessageContact" value="1" /> Messages</label>
        </div>
        <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500">Add contact</button>
      </form>
    </div>
  );
}
