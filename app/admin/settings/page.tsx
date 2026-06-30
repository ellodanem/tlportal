import Link from "next/link";

import { BillingAlertPhonesForm } from "@/components/admin/settings/billing-alert-phones-form";
import { AutoReceiptEmailForm } from "@/components/admin/settings/auto-receipt-email-form";
import { BrandingForm } from "@/components/admin/settings/branding-form";
import { PortalTimezoneForm } from "@/components/admin/settings/portal-timezone-form";
import { SmtpSettingsForm } from "@/components/admin/settings/smtp-settings-form";
import { getAutoEmailPaidStripeReceiptsForForm } from "@/lib/billing/auto-receipt-email-settings";
import { getBillingAlertPhonesForForm } from "@/lib/billing/billing-alert-phones";
import { getSession } from "@/lib/auth/get-session";
import { getBrandingSettings } from "@/lib/branding/app-settings";
import { getSmtpSettingsForForm } from "@/lib/email/smtp-settings";
import { getPortalTimezoneSettingsForForm } from "@/lib/portal/timezone-settings";

export default async function AdminSettingsPage() {
  const [branding, smtpInitial, billingAlertPhones, autoReceiptEmail, portalTimezone, session] = await Promise.all([
    getBrandingSettings(),
    getSmtpSettingsForForm(),
    getBillingAlertPhonesForForm(),
    getAutoEmailPaidStripeReceiptsForForm(),
    getPortalTimezoneSettingsForForm(),
    getSession(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Branding, timezone, outgoing email (SMTP), and portal preferences. The logo appears in the admin sidebar for
          everyone signed in.
        </p>
      </div>

      <BrandingForm
        key={`${branding.logoUrl ?? "none"}-${branding.logoSize}`}
        initialLogoUrl={branding.logoUrl}
        initialLogoSize={branding.logoSize}
      />
      <PortalTimezoneForm
        key={`${portalTimezone.timezone}-${portalTimezone.location}`}
        initialTimezone={portalTimezone.timezone}
        initialLocation={portalTimezone.location}
      />
      <SmtpSettingsForm initial={smtpInitial} defaultTestTo={session?.email ?? ""} />
      <AutoReceiptEmailForm initialEnabled={autoReceiptEmail} />
      <BillingAlertPhonesForm initialPhones={billingAlertPhones} />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Billing cutover</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Import historical Invoiless invoices and review native billing mode.
        </p>
        <Link
          href="/admin/billing-cutover"
          className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Open billing cutover →
        </Link>
      </section>
    </div>
  );
}
