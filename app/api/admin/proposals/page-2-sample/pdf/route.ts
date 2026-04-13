import { getSession } from "@/lib/auth/get-session";
import { buildProposalPage2SamplePdfBuffer } from "@/lib/proposals/pdf";

export const runtime = "nodejs";

/** Single-page PDF: inner letterhead + default Overview + pricing table + footnotes (template page 2). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const buf = buildProposalPage2SamplePdfBuffer();

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="proposal-page-2-sample.pdf"',
    },
  });
}
