import type { Metadata, Viewport } from "next";

import { VisitTracker } from "@/components/vehicle/visit-tracker";
import { getVehicleWhatsAppNumber, sanitizeSource } from "@/lib/vehicle/qr-landing";

export const metadata: Metadata = {
  title: "Know Where Your Vehicle Is — Track Lucia",
  description:
    "Real-time GPS tracking for private vehicles, rental companies and business fleets in Saint Lucia. Get a quote on WhatsApp.",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#023e63",
  width: "device-width",
  initialScale: 1,
};

const NAVY = "#023e63";
const BRAND_GREEN = "#17964f";
const WHATSAPP_GREEN = "#25d366";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35ZM12.04 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.9 6.99c0 5.45-4.44 9.88-9.9 9.88ZM20.52 3.45A11.8 11.8 0 0 0 12.04 0C5.5 0 .16 5.33.16 11.88c0 2.09.55 4.14 1.59 5.95L0 24l6.34-1.66a11.9 11.9 0 0 0 5.7 1.45h.01c6.54 0 11.88-5.33 11.88-11.88 0-3.17-1.23-6.15-3.41-8.46Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4 shrink-0" style={{ color: BRAND_GREEN }}>
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="m6.5 10.2 2.3 2.3 4.7-4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-6">
      <path d="M5 16V11l1.7-4.3A2 2 0 0 1 8.6 5.5h6.8a2 2 0 0 1 1.9 1.2L19 11v5" />
      <path d="M3.5 11h17M5 16h14v2.2a.8.8 0 0 1-.8.8h-1.4a.8.8 0 0 1-.8-.8V16M7.8 19h-1.4a.8.8 0 0 1-.8-.8V16" />
      <circle cx="8" cy="13.5" r=".6" fill="currentColor" />
      <circle cx="16" cy="13.5" r=".6" fill="currentColor" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-6">
      <circle cx="8" cy="15" r="3.5" />
      <path d="m10.5 12.5 8-8M15.5 7.5l2.5 2.5M13 10l2 2" />
    </svg>
  );
}

function FleetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-6">
      <path d="M2.5 16.5v-9a1 1 0 0 1 1-1H14v10M14 9.5h4l3 3.5v3.5h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4 shrink-0">
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9ZM10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** Stylised "live map" hero: grid, route line and a pulsing pin. Pure SVG/CSS. */
function LiveMapHero() {
  return (
    <div
      className="relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-3xl shadow-xl shadow-sky-900/20 ring-1 ring-white/10"
      style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #05577f 100%)` }}
      role="img"
      aria-label="Illustration of a vehicle shown live on a map"
    >
      <svg viewBox="0 0 320 200" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="vq-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="white" strokeOpacity=".07" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="320" height="200" fill="url(#vq-grid)" />
        {/* streets */}
        <path d="M-10 150 C60 140 90 90 150 96 S250 130 335 60" fill="none" stroke="white" strokeOpacity=".14" strokeWidth="10" strokeLinecap="round" />
        <path d="M60 -10 C70 50 110 70 130 130 S150 190 160 215" fill="none" stroke="white" strokeOpacity=".1" strokeWidth="7" strokeLinecap="round" />
        {/* trip history */}
        <path d="M-10 150 C60 140 90 90 150 96 S215 118 232 92" fill="none" stroke="#7fd6f7" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" />
      </svg>

      {/* live pin */}
      <div className="absolute left-[72.5%] top-[46%] -translate-x-1/2 -translate-y-1/2">
        <span className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-emerald-400/40 motion-reduce:animate-none" />
        <span className="relative flex size-11 items-center justify-center rounded-full bg-white shadow-lg" style={{ color: BRAND_GREEN }}>
          <CarIcon />
        </span>
      </div>

      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white backdrop-blur">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        LIVE
      </div>

      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs text-zinc-800 shadow-md backdrop-blur">
        <span className="flex size-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <BellIcon />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">Alert: your vehicle just started moving</span>
        <span className="shrink-0 text-zinc-400">now</span>
      </div>
    </div>
  );
}

const FEATURES = ["Live location", "Instant alerts", "Trip history"] as const;

const AUDIENCES = [
  { label: "Private vehicles", icon: <CarIcon /> },
  { label: "Rental companies", icon: <KeyIcon /> },
  { label: "Business fleets", icon: <FleetIcon /> },
] as const;

export default async function VehicleQrPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const srcParam = Array.isArray(sp.src) ? sp.src[0] : sp.src;
  const source = sanitizeSource(srcParam);

  const whatsappReady = getVehicleWhatsAppNumber() !== null;
  const whatsappHref = source ? `/vehicle/whatsapp?src=${encodeURIComponent(source)}` : "/vehicle/whatsapp";
  const learnMoreUrl = process.env.VEHICLE_LEARN_MORE_URL?.trim() || null;

  return (
    <main
      className="mx-auto flex font-[family-name:var(--font-geist-sans)] min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-zinc-900"
      style={{ background: "linear-gradient(180deg, #eaf6fd 0%, #ffffff 38%)" }}
    >
      <VisitTracker source={source} />

      {/* Logo (source image has generous padding; crop it to the mark + wordmark) */}
      <div className="relative mx-auto aspect-[910/430] w-52 overflow-hidden" aria-label="Track Lucia" role="img">
        {/* eslint-disable-next-line @next/next/no-img-element -- public brand mark */}
        <img
          src="/track-lucia-logo.jpg"
          alt=""
          width={1024}
          height={1024}
          className="absolute max-w-none mix-blend-multiply"
          style={{ width: "112.5%", left: "-6%", top: "-70%" }}
        />
      </div>

      <div className="mt-2">
        <LiveMapHero />
      </div>

      <h1 className="mt-7 text-balance text-center text-[2rem] font-extrabold leading-[1.1] tracking-tight" style={{ color: NAVY }}>
        Know where your vehicle is.
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-balance text-center text-[15px] leading-relaxed text-zinc-600">
        Real-time GPS tracking for private vehicles, rental companies and business fleets in Saint&nbsp;Lucia.
      </p>

      <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium text-zinc-700">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-1.5">
            <CheckIcon />
            {f}
          </li>
        ))}
      </ul>

      {/* Primary action */}
      <div className="mt-8">
        {whatsappReady ? (
          <a
            href={whatsappHref}
            rel="nofollow"
            className="group relative flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-700/30 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
            style={{ backgroundColor: "#128c4a" }}
          >
            <span
              className="absolute inset-0 -z-10 rounded-2xl opacity-40 blur-md transition group-hover:opacity-60"
              style={{ backgroundColor: WHATSAPP_GREEN }}
              aria-hidden="true"
            />
            <WhatsAppIcon className="size-7 shrink-0" />
            Get a GPS quote on WhatsApp
          </a>
        ) : (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-center text-sm text-amber-900">
            WhatsApp is not configured yet. Set <code className="font-mono">VEHICLE_WHATSAPP_NUMBER</code>.
          </p>
        )}
        <p className="mt-3 text-center text-sm text-zinc-500">Chat with us directly. Quick replies, no obligation.</p>
      </div>

      {/* Who it is for */}
      <section className="mt-9" aria-label="Who Track Lucia is for">
        <ul className="grid grid-cols-3 gap-2.5">
          {AUDIENCES.map((a) => (
            <li
              key={a.label}
              className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white px-2 py-4 text-center text-xs font-semibold leading-tight text-zinc-700 shadow-sm"
            >
              <span style={{ color: BRAND_GREEN }}>{a.icon}</span>
              {a.label}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto pt-8 text-center">
        {learnMoreUrl ? (
          <a
            href={learnMoreUrl}
            className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
          >
            Learn more about our services
          </a>
        ) : null}
        <p className="mt-1 text-xs text-zinc-400">Track Lucia · Saint Lucia</p>
      </div>
    </main>
  );
}
