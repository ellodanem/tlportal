"use client";

import type { BrandingLogoSize } from "@prisma/client";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

import { AdminCreateMenu, AdminSectionCreateMenu } from "@/components/admin-create-menu";
import {
  IconNavBroadcast,
  IconNavChevronLeft,
  IconNavChevronRight,
  IconNavDashboard,
  IconNavExpenses,
  IconNavExternal,
  IconNavInbox,
  IconNavInvoice,
  IconNavPackage,
  IconNavProposal,
  IconNavRecurring,
  IconNavReports,
  IconNavSettings,
  IconNavSim,
} from "@/components/admin-nav-icons";
import { IconDevice, IconLayers, IconUsers } from "@/components/dashboard/dashboard-icons";
import { brandingLogoHeightClass } from "@/lib/branding/logo-size";

const STORAGE_KEY = "tl-admin-sidebar-collapsed";

type NavLink = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

type NavSection = {
  id: string;
  label: string;
  createSection?: "sales" | "billing" | "fleet";
  links: NavLink[];
};

const overviewLinks: NavLink[] = [
  { href: "/admin", label: "Dashboard", Icon: IconNavDashboard },
  { href: "/admin/customers", label: "Customers", Icon: IconUsers },
  { href: "/admin/reports", label: "Reports", Icon: IconNavReports },
];

function buildNavSections(ctx: { nativeBillingPrimary: boolean; invoilessLegacyUi: boolean }): NavSection[] {
  const invoiceLabel = ctx.nativeBillingPrimary ? "Invoices" : "TL invoices";
  const billingLinks: NavLink[] = [
    { href: "/admin/tl-invoices", label: invoiceLabel, Icon: IconNavInvoice },
    { href: "/admin/recurring-invoices", label: "Recurring", Icon: IconNavRecurring },
    { href: "/admin/expenses", label: "Expenses", Icon: IconNavExpenses },
  ];
  if (ctx.invoilessLegacyUi) {
    billingLinks.push({ href: "/admin/invoices", label: "Invoiless", Icon: IconNavExternal });
  }

  return [
    {
      id: "sales",
      label: "Sales",
      createSection: "sales",
      links: [
        { href: "/admin/proposals", label: "Proposals", Icon: IconNavProposal },
        { href: "/admin/quotes", label: "Quotes", Icon: IconNavInvoice },
      ],
    },
    {
      id: "billing",
      label: "Billing",
      createSection: "billing",
      links: billingLinks,
    },
    {
      id: "fleet",
      label: "Fleet",
      createSection: "fleet",
      links: [
        { href: "/admin/devices", label: "Devices", Icon: IconDevice },
        { href: "/admin/sims", label: "SIMs", Icon: IconNavSim },
      ],
    },
    {
      id: "communications",
      label: "Communications",
      links: [{ href: "/admin/broadcasts", label: "Broadcasts", Icon: IconNavBroadcast }],
    },
  ];
}

const settingsLink: NavLink = { href: "/admin/settings", label: "Settings", Icon: IconNavSettings };

/** Show Device models sub-link only while browsing the devices area (fleet + catalog). */
function isDevicesSection(pathname: string): boolean {
  return pathname.startsWith("/admin/devices") || pathname.startsWith("/admin/device-models");
}

/** Customers + registration queue share one nav group. */
function isCustomerSection(pathname: string): boolean {
  return pathname.startsWith("/admin/customers") || pathname.startsWith("/admin/registration-requests");
}

/** Settings + subscription plan prices + billing cutover share one nav group. */
function isSettingsSection(pathname: string): boolean {
  return (
    pathname.startsWith("/admin/settings") ||
    pathname.startsWith("/admin/billing-cutover") ||
    pathname.startsWith("/admin/subscription-options") ||
    pathname.startsWith("/admin/users")
  );
}

function navClass(active: boolean, collapsed: boolean) {
  const layout = collapsed
    ? "flex items-center justify-center rounded-md px-2 py-2.5"
    : "flex items-center gap-2.5 rounded-md px-3 py-2";
  const colors = active
    ? "bg-emerald-50 text-sm font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
    : "text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50";
  return `${layout} ${colors}`;
}

function subNavClass(active: boolean) {
  return active
    ? "ml-2 mt-0.5 flex items-center gap-2 rounded-md border-l-2 border-emerald-400 bg-emerald-50/90 py-2 pl-3 pr-2 text-sm font-medium text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100"
    : "ml-2 mt-0.5 flex items-center gap-2 rounded-md border-l-2 border-transparent py-2 pl-3 pr-2 text-sm font-medium text-zinc-600 hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-50";
}

function sectionHeaderClass(collapsed: boolean) {
  return collapsed
    ? "sr-only"
    : "mb-1 mt-4 flex items-center justify-between px-3 first:mt-1";
}

function NavIcon({
  Icon,
  className,
}: {
  Icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return <Icon className={`h-5 w-5 shrink-0 opacity-90 ${className ?? ""}`} />;
}

function NavSectionHeader({
  label,
  createSection,
  collapsed,
}: {
  label: string;
  createSection?: NavSection["createSection"];
  collapsed: boolean;
}) {
  if (collapsed) return null;

  return (
    <div className={sectionHeaderClass(collapsed)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</span>
      {createSection ? <AdminSectionCreateMenu section={createSection} sectionLabel={label} /> : null}
    </div>
  );
}

export function AdminSidebar({
  brandingLogoUrl,
  brandingLogoSize = "m",
  nativeBillingPrimary = true,
  invoilessLegacyUi = false,
}: {
  brandingLogoUrl?: string | null;
  brandingLogoSize?: BrandingLogoSize;
  nativeBillingPrimary?: boolean;
  invoilessLegacyUi?: boolean;
}) {
  const pathname = usePathname();
  const navSections = buildNavSections({ nativeBillingPrimary, invoilessLegacyUi });
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function renderNavLink({ href, label, Icon }: NavLink): ReactNode {
    if (href === "/admin/customers") {
      const customerParentActive = isCustomerSection(pathname);
      const registrationsActive = pathname.startsWith("/admin/registration-requests");
      const showSub = isCustomerSection(pathname) && !collapsed;
      return (
        <div key={href} className="flex flex-col gap-0.5">
          <Link href={href} className={navClass(customerParentActive, collapsed)} title={collapsed ? label : undefined}>
            <NavIcon Icon={Icon} />
            <span className={collapsed ? "sr-only" : ""}>{label}</span>
          </Link>
          {showSub ? (
            <Link href="/admin/registration-requests" className={subNavClass(registrationsActive)}>
              <IconNavInbox className="h-4 w-4 shrink-0 opacity-80" />
              <span>Registration queue</span>
            </Link>
          ) : null}
        </div>
      );
    }

    if (href === "/admin/devices") {
      const devicesParentActive = isDevicesSection(pathname);
      const deviceModelsActive = pathname.startsWith("/admin/device-models");
      const showSub = isDevicesSection(pathname) && !collapsed;
      return (
        <div key={href} className="flex flex-col gap-0.5">
          <Link href={href} className={navClass(devicesParentActive, collapsed)} title={collapsed ? label : undefined}>
            <NavIcon Icon={Icon} />
            <span className={collapsed ? "sr-only" : ""}>{label}</span>
          </Link>
          {showSub ? (
            <Link href="/admin/device-models" className={subNavClass(deviceModelsActive)}>
              <IconNavPackage className="h-4 w-4 shrink-0 opacity-80" />
              <span>Device models</span>
            </Link>
          ) : null}
        </div>
      );
    }

    if (href === "/admin/settings") {
      const settingsParentActive = isSettingsSection(pathname);
      const plansActive = pathname.startsWith("/admin/subscription-options");
      const usersActive = pathname.startsWith("/admin/users");
      const cutoverActive = pathname.startsWith("/admin/billing-cutover");
      const showSub = isSettingsSection(pathname) && !collapsed;
      return (
        <div key={href} className="flex flex-col gap-0.5">
          <Link href={href} className={navClass(settingsParentActive, collapsed)} title={collapsed ? label : undefined}>
            <NavIcon Icon={Icon} />
            <span className={collapsed ? "sr-only" : ""}>{label}</span>
          </Link>
          {showSub ? (
            <>
              <Link href="/admin/billing-cutover" className={subNavClass(cutoverActive)}>
                <IconNavInvoice className="h-4 w-4 shrink-0 opacity-80" />
                <span>Billing cutover</span>
              </Link>
              <Link href="/admin/subscription-options" className={subNavClass(plansActive)}>
                <IconLayers className="h-4 w-4 shrink-0 opacity-80" />
                <span>Plans</span>
              </Link>
              <Link href="/admin/users" className={subNavClass(usersActive)}>
                <IconUsers className="h-4 w-4 shrink-0 opacity-80" />
                <span>Users</span>
              </Link>
            </>
          ) : null}
        </div>
      );
    }

    const active =
      href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

    return (
      <Link key={href} href={href} className={navClass(active, collapsed)} title={collapsed ? label : undefined}>
        <NavIcon Icon={Icon} />
        <span className={collapsed ? "sr-only" : ""}>{label}</span>
      </Link>
    );
  }

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-zinc-200 bg-white transition-[width] duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-900 ${
        collapsed ? "w-[4.5rem]" : "w-56"
      }`}
    >
      <div
        className={`flex items-start gap-1 border-b border-zinc-100 dark:border-zinc-800 ${
          collapsed ? "flex-col items-center px-2 py-4" : "justify-between px-3 py-5"
        }`}
      >
        <Link
          href="/admin"
          className={`block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-md ${
            collapsed ? "flex justify-center" : "flex-1"
          }`}
        >
          {brandingLogoUrl ? (
            <>
              <span className="sr-only">Track Lucia — TL Portal home</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded branding */}
              <img
                src={brandingLogoUrl}
                alt=""
                className={`w-auto max-w-full object-contain object-left dark:brightness-[1.02] ${brandingLogoHeightClass(
                  brandingLogoSize,
                  collapsed,
                )} ${collapsed ? "mx-auto" : ""}`}
              />
            </>
          ) : (
            <>
              <p
                className={`text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 ${
                  collapsed ? "sr-only" : ""
                }`}
              >
                Track Lucia
              </p>
              <span
                className={`mt-1 block font-semibold text-zinc-900 dark:text-zinc-50 ${
                  collapsed ? "text-center text-xs" : "text-lg"
                }`}
              >
                TL Portal
              </span>
            </>
          )}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mt-0.5 shrink-0 rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <IconNavChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <div className="flex justify-center border-b border-zinc-100 px-2 py-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <IconNavChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      <div className={`relative ${collapsed ? "flex justify-center px-2 pt-2" : "px-3 pt-1"}`}>
        <AdminCreateMenu sidebarCollapsed={collapsed} />
      </div>

      <nav className={`flex min-h-0 flex-1 flex-col ${collapsed ? "overflow-y-auto p-2" : "overflow-y-auto p-3"}`}>
        <div className="flex flex-col gap-1">{overviewLinks.map((link) => renderNavLink(link))}</div>

        {navSections.map((section) => (
          <div key={section.id} className="flex flex-col gap-1">
            <NavSectionHeader label={section.label} createSection={section.createSection} collapsed={collapsed} />
            {section.links.map((link) => renderNavLink(link))}
          </div>
        ))}

        <div className="mt-auto flex flex-col gap-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {renderNavLink(settingsLink)}
        </div>
      </nav>
    </aside>
  );
}
