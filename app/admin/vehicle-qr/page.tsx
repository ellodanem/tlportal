import { getVehiclePageUrl } from "@/lib/vehicle/qr-generate";
import { sanitizeSource } from "@/lib/vehicle/qr-landing";
import { getVehicleQrStats } from "@/lib/vehicle/qr-stats";

type Props = { searchParams: Promise<{ src?: string }> };

function pct(clicks: number, visits: number) {
  if (visits <= 0) return "—";
  return `${Math.round((clicks / visits) * 100)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}

const btn =
  "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition";

export default async function VehicleQrAdminPage({ searchParams }: Props) {
  const { src: srcRaw } = await searchParams;
  const src = sanitizeSource(srcRaw);
  const pageUrl = getVehiclePageUrl(src);
  const imgBase = `/api/admin/vehicle-qr?${src ? `src=${encodeURIComponent(src)}&` : ""}`;

  const stats = await getVehicleQrStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Vehicle QR code</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          QR code for the public <span className="font-mono">/vehicle</span> page, plus visit and WhatsApp click
          tracking.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated on demand, auth-gated */}
          <img
            src={`${imgBase}format=svg`}
            alt={`QR code for ${pageUrl}`}
            width={288}
            height={288}
            className="mx-auto size-72 max-w-full rounded-lg border border-zinc-200"
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={`${imgBase}format=svg&download=1`}
              className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}
            >
              Download SVG
            </a>
            <a
              href={`${imgBase}format=png&download=1`}
              className={`${btn} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800`}
            >
              Download PNG
            </a>
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            SVG is best for print (scales to any size).
          </p>
        </section>

        <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Points to</h2>
            <p className="mt-1 break-all rounded-lg bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {pageUrl}
            </p>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Uses <span className="font-mono">APP_BASE_URL</span>. Check this is your real public domain before
              printing.
            </p>
          </div>

          <form method="get" className="space-y-2">
            <label htmlFor="src" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Tag this QR code <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="src"
                name="src"
                defaultValue={src ?? ""}
                maxLength={48}
                placeholder="e.g. flyer, windscreen-sticker, billboard"
                className="min-h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
              <button type="submit" className={`${btn} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900`}>
                Update QR
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Letters, numbers, <span className="font-mono">- _ .</span> only. Each tag gets its own row in the stats
              below, so you can see which printed code performs best.
            </p>
          </form>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Performance</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="QR visits" value={stats.visits} hint={`${stats.visits30d} in last 30 days`} />
          <Stat label="WhatsApp clicks" value={stats.clicks} hint={`${stats.clicks30d} in last 30 days`} />
          <Stat label="Click rate" value={pct(stats.clicks, stats.visits)} hint="clicks ÷ visits" />
          <Stat label="Click rate (30d)" value={pct(stats.clicks30d, stats.visits30d)} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Tag</th>
                <th className="px-4 py-2.5 text-right font-medium">Visits</th>
                <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                <th className="px-4 py-2.5 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {stats.bySource.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                    No scans yet.
                  </td>
                </tr>
              ) : (
                stats.bySource.map((r) => (
                  <tr key={r.source}>
                    <td className="px-4 py-2.5 font-mono text-zinc-800 dark:text-zinc-200">{r.source}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.visits}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.clicks}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pct(r.clicks, r.visits)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Visits count once per browser session; bots are excluded. A click can exceed visits if someone opens the
          WhatsApp link without the page loading its tracker (e.g. ad blockers).
        </p>
      </section>
    </div>
  );
}
