import { BrandingForm } from "@/components/admin/settings/branding-form";
import { SmtpSettingsForm } from "@/components/admin/settings/smtp-settings-form";
import { getBrandingSettings } from "@/lib/branding/app-settings";
import { getSmtpSettingsForForm } from "@/lib/email/smtp-settings";

export default async function AdminSettingsPage() {
  const [branding, smtpInitial] = await Promise.all([getBrandingSettings(), getSmtpSettingsForForm()]);

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
      <SmtpSettingsForm initial={smtpInitial} />
    </div>
  );
}
