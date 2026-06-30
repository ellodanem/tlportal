import Link from "next/link";

export function StripeSubscriptionInvoicePanel({
  billingInvoiceId,
  customerId,
  hostedInvoiceUrl,
  invoicePdfUrl,
  stripeExternalId,
  providerInvoiceNumber,
}: {
  billingInvoiceId: string;
  customerId: string;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  stripeExternalId: string;
  providerInvoiceNumber: string | null;
}) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-100">
      <p className="font-medium">Stripe subscription invoice</p>
      <p className="mt-1 text-indigo-900/90 dark:text-indigo-200/90">
        Paid via card on file. This row is mirrored from Stripe for unified AR — edit in{" "}
        <Link
          href={`/admin/customers/${customerId}/billing`}
          className="font-semibold underline underline-offset-2"
        >
          Customer → Billing
        </Link>
        .
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        <li>
          <a
            href={`/api/admin/billing-invoices/${billingInvoiceId}/pdf`}
            className="font-medium text-indigo-800 underline underline-offset-2 dark:text-indigo-300"
          >
            Download TL receipt PDF
          </a>
        </li>
        {hostedInvoiceUrl ? (
          <li>
            <a
              href={hostedInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-800 underline underline-offset-2 dark:text-indigo-300"
            >
              Stripe hosted invoice
              {providerInvoiceNumber ? ` (${providerInvoiceNumber})` : ""}
            </a>
          </li>
        ) : null}
        {invoicePdfUrl ? (
          <li>
            <a
              href={invoicePdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-800 underline underline-offset-2 dark:text-indigo-300"
            >
              Stripe PDF
            </a>
          </li>
        ) : null}
        <li className="font-mono text-xs text-indigo-800/80 dark:text-indigo-300/80">{stripeExternalId}</li>
      </ul>
    </div>
  );
}
