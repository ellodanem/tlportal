"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminCreateMenu } from "@/components/admin-create-menu";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/invoices", label: "Invoices" },
  { href: "/admin/devices", label: "Devices" },
  { href: "/admin/sims", label: "SIMs" },
  { href: "/admin/settings", label: "Settings" },
] as const;

/** Show Device models sub-link only while browsing the devices area (fleet + catalog). */
function isDevicesSection(pathname: string): boolean {
  return pathname.startsWith("/admin/devices") || pathname.startsWith("/admin/device-models");
}

/** Customers + registration queue share one nav group. */
function isCustomerSection(pathname: string): boolean {
  return pathname.startsWith("/admin/customers") || pathname.startsWith("/admin/registration-requests");
}

/** Settings + subscription plan prices share one nav group. */
function isSettingsSection(pathname: string): boolean {
  return pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/subscription-options");
}

function navClass(active: boolean) {
  return active
    ? "rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
    : "rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50";
}

function subNavClass(active: boolean) {
  return active
    ? "ml-2 mt-0.5 block rounded-md border-l-2 border-emerald-400 bg-emerald-50/90 py-2 pl-3 pr-2 text-sm font-medium text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100"
    : "ml-2 mt-0.5 block rounded-md border-l-2 border-transparent py-2 pl-3 pr-2 text-sm font-medium text-zinc-600 hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-50";
}

export function AdminSidebar({ brandingLogoUrl }: { brandingLogoUrl?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 px-4 py-6 dark:border-zinc-800">
        <Link href="/admin" className="block outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-md">
          {brandingLogoUrl ? (
            <>
              <span className="sr-only">Track Lucia — TL Portal home</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded branding */}
              <img
                src={brandingLogoUrl}
                alt=""
                className="h-16 w-auto max-w-full object-contain object-left dark:brightness-[1.02]"
              />
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Track Lucia
              </p>
              <span className="mt-1 block text-lg font-semibold text-zinc-900 dark:text-zinc-50">TL Portal</span>
            </>
          )}
        </Link>
      </div>
      <div className="relative px-3 pt-1">
        <AdminCreateMenu />
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {links.map(({ href, label }) => {
          if (href === "/admin/customers") {
            const customerParentActive = isCustomerSection(pathname);
            const registrationsActive = pathname.startsWith("/admin/registration-requests");
            const showSub = isCustomerSection(pathname);
            return (
              <div key={href} className="flex flex-col gap-0.5">
                <Link href={href} className={navClass(customerParentActive)}>
                  {label}
                </Link>
                {showSub ? (
                  <Link href="/admin/registration-requests" className={subNavClass(registrationsActive)}>
                    Registrations
                  </Link>
                ) : null}
              </div>
            );
          }

          if (href === "/admin/devices") {
            const devicesParentActive = isDevicesSection(pathname);
            const deviceModelsActive = pathname.startsWith("/admin/device-models");
            const showSub = isDevicesSection(pathname);
            return (
              <div key={href} className="flex flex-col gap-0.5">
                <Link href={href} className={navClass(devicesParentActive)}>
                  {label}
                </Link>
                {showSub ? (
                  <Link href="/admin/device-models" className={subNavClass(deviceModelsActive)}>
                    Device models
                  </Link>
                ) : null}
              </div>
            );
          }

          if (href === "/admin/settings") {
            const settingsParentActive = isSettingsSection(pathname);
            const plansActive = pathname.startsWith("/admin/subscription-options");
            const showSub = isSettingsSection(pathname);
            return (
              <div key={href} className="flex flex-col gap-0.5">
                <Link href={href} className={navClass(settingsParentActive)}>
                  {label}
                </Link>
                {showSub ? (
                  <Link href="/admin/subscription-options" className={subNavClass(plansActive)}>
                    Plans
                  </Link>
                ) : null}
              </div>
            );
          }

          const active =
            href === "/admin"
              ? pathname === "/admin"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={navClass(active)}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Subscription and device alerts will appear here as we wire monitoring.
        </p>
      </div>
    </aside>
  );
}
