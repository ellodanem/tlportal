import { BillingAlertPhonesForm } from "@/components/admin/settings/billing-alert-phones-form";
import { AutoReceiptEmailForm } from "@/components/admin/settings/auto-receipt-email-form";
import { BrandingForm } from "@/components/admin/settings/branding-form";
import { SmtpSettingsForm } from "@/components/admin/settings/smtp-settings-form";
import { getAutoEmailPaidStripeReceiptsForForm } from "@/lib/billing/auto-receipt-email-settings";
import { getBillingAlertPhonesForForm } from "@/lib/billing/billing-alert-phones";
import { getSession } from "@/lib/auth/get-session";
import { getBrandingSettings } from "@/lib/branding/app-settings";
import { getSmtpSettingsForForm } from "@/lib/email/smtp-settings";

export default async function AdminSettingsPage() {
  const [branding, smtpInitial, billingAlertPhones, autoReceiptEmail, session] = await Promise.all([
    getBrandingSettings(),
    getSmtpSettingsForForm(),
    getBillingAlertPhonesForForm(),
    getAutoEmailPaidStripeReceiptsForForm(),
    getSession(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Branding, outgoing email (SMTP), and portal preferences. The logo appears in the admin sidebar for everyone
          signed in.
        </p>
      </div>

      <BrandingForm
        key={`${branding.logoUrl ?? "none"}-${branding.logoSize}`}
        initialLogoUrl={branding.logoUrl}
        initialLogoSize={branding.logoSize}
      />
      <SmtpSettingsForm initial={smtpInitial} defaultTestTo={session?.email ?? ""} />
      <AutoReceiptEmailForm initialEnabled={autoReceiptEmail} />
      <BillingAlertPhonesForm initialPhones={billingAlertPhones} />
    </div>
  );
}
