import { getSession } from "@/lib/auth/get-session";
import { getVehiclePageUrl, vehicleQrPng, vehicleQrSvg } from "@/lib/vehicle/qr-generate";
import { sanitizeSource } from "@/lib/vehicle/qr-landing";

/** Admin-only QR image for the /vehicle landing page. `?format=svg|png`, `?src=tag`, `?download=1`. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const params = new URL(req.url).searchParams;
  const src = sanitizeSource(params.get("src"));
  const format = params.get("format") === "png" ? "png" : "svg";
  const url = getVehiclePageUrl(src);
  const filename = `vehicle-qr${src ? `-${src}` : ""}.${format}`;

  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
  };
  if (params.get("download") === "1") {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  if (format === "png") {
    const png = await vehicleQrPng(url);
    return new Response(new Uint8Array(png), {
      headers: { ...headers, "Content-Type": "image/png" },
    });
  }

  const svg = await vehicleQrSvg(url);
  return new Response(svg, {
    headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" },
  });
}
