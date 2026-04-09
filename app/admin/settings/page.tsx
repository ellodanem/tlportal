import { BrandingForm } from "@/components/admin/settings/branding-form";
import { getBrandingLogoUrl } from "@/lib/branding/app-settings";

export default async function AdminSettingsPage() {
  const logoUrl = await getBrandingLogoUrl();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Branding and portal preferences. Upload your logo here; it appears in the admin sidebar for everyone signed in.
        </p>
      </div>

      <BrandingForm initialLogoUrl={logoUrl} />
    </div>
  );
}
