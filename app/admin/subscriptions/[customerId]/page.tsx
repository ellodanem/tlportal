import Link from "next/link";

import { SubscriptionLifecycleActions } from "@/components/admin/subscription-lifecycle-actions";
import { CUSTOMER_SUBSCRIPTION_STATUS_LABEL } from "@/lib/domain/customer-subscription";
import { prisma } from "@/lib/db";
import { formatExpenseAmount } from "@/lib/domain/expenses";

type Props = { params: Promise<{ customerId: string }> };

function customerName(customer: { company: string | null; firstName: string | null; lastName: string | null }) {
  return customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Unnamed customer";
}

export default async function SubscriptionLifecyclePage({ params }: Props) {
  const { customerId } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, company: true, firstName: true, lastName: true, email: true, billingMode: true, customerSubscriptions: { where: { controlMode: "legacy" }, orderBy: { updatedAt: "desc" }, take: 1 }, recurringInvoiceSchedules: { orderBy: { updatedAt: "desc" }, take: 1, include: { lineItems: { select: { quantity: true, unitPrice: true } } } } },
  });
  if (!customer) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Customer not found.</div>;
  const stripe = customer.customerSubscriptions[0] ?? null;
  const schedule = customer.recurringInvoiceSchedules[0] ?? null;
  const scheduleAmount = schedule ? schedule.lineItems.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0) : 0;
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
    <div><Link href="/admin/subscriptions" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Subscriptions</Link><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-medium text-zinc-500">Subscription lifecycle</p><h1 className="text-2xl font-semibold tracking-tight">{customerName(customer)}</h1><p className="mt-1 text-sm text-zinc-500">{customer.email ?? "No email on file"}</p></div><Link href={`/admin/customers/${customer.id}/billing`} className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open customer billing</Link></div></div>
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">Collection and lifecycle</h2><p className="mt-1 text-sm text-zinc-500">The subscription is the commercial relationship. Collection is either automatic card billing or recurring native invoices.</p></div><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{customer.billingMode === "stripe_subscription" ? "Card autocharge" : "Manual invoice"}</span></div><div className="mt-5"><SubscriptionLifecycleActions customerId={customer.id} scheduleId={schedule?.id ?? null} scheduleStatus={schedule?.status ?? null} hasStripeSubscription={Boolean(stripe?.stripeSubscriptionId)} /></div></section>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Card subscription</h2>{stripe ? <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Status</dt><dd className="font-medium">{CUSTOMER_SUBSCRIPTION_STATUS_LABEL[stripe.status]}</dd></div><div><dt className="text-zinc-500">Term</dt><dd className="font-medium">{stripe.planTermMonths} months</dd></div><div><dt className="text-zinc-500">Vehicles</dt><dd className="font-medium">{stripe.vehicleCount ?? 1}</dd></div><div><dt className="text-zinc-500">Monthly value</dt><dd className="font-medium">{formatExpenseAmount(Number(stripe.monthlyRateXcd ?? 0) * (stripe.vehicleCount ?? 1), "XCD")}</dd></div></dl> : <p className="mt-4 text-sm text-zinc-500">No Stripe subscription record for this customer.</p>}</section>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Manual invoice schedule</h2>{schedule ? <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Status</dt><dd className="font-medium">{schedule.status[0].toUpperCase() + schedule.status.slice(1)}</dd></div><div><dt className="text-zinc-500">Interval</dt><dd className="font-medium">Every {schedule.intervalMonths} month{schedule.intervalMonths === 1 ? "" : "s"}</dd></div><div><dt className="text-zinc-500">Next issue</dt><dd className="font-medium">{schedule.nextIssueDate.toLocaleDateString(undefined, { dateStyle: "medium" })}</dd></div><div><dt className="text-zinc-500">Per-cycle value</dt><dd className="font-medium">{formatExpenseAmount(scheduleAmount, schedule.currency)}</dd></div></dl> : <p className="mt-4 text-sm text-zinc-500">No recurring invoice schedule for this customer.</p>}</section>
    </div>
  </div>;
}
