import "server-only";

import type { Proposal, ProposalLineItem, ProposalVisualBlock } from "@prisma/client";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { getProposalIssuerBlock } from "@/lib/proposals/issuer";

export type ProposalForPdf = Proposal & {
  lineItems: ProposalLineItem[];
  visuals: ProposalVisualBlock[];
};

const MARGIN = 48;
const LINE = 14;
const PAGE_W = 612;
const PAGE_H = 792;

function categoryLabel(c: ProposalLineItem["category"]): string {
  switch (c) {
    case "hardware":
      return "Hardware";
    case "subscription":
      return "Subscription";
    case "installation":
      return "Installation";
    case "service":
      return "Service";
    default:
      return "Other";
  }
}

function money(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${safe.toFixed(2)}`;
}

function lineTotal(item: ProposalLineItem): number {
  const q = Number(item.quantity);
  const p = Number(item.unitPrice);
  return (Number.isFinite(q) ? q : 0) * (Number.isFinite(p) ? p : 0);
}

/** Subject line under "Proposal for" (matches commercial samples that split headline vs subtitle). */
function proposalSubjectLine(proposal: ProposalForPdf): string {
  const t = proposal.title.trim();
  if (!t) return "Vehicle tracking solution";
  const parts = t.split("—").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  return parts[0] ?? "Vehicle tracking solution";
}

function addParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > PAGE_H - MARGIN - lineHeight) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

/** Terms split with --- alone on a line between sections; first line of each block is the subsection title. */
function parseTermsBlocks(raw: string): { heading: string; body: string }[] {
  const normalized = raw.trim();
  if (!normalized) return [];
  if (!normalized.includes("\n---\n")) {
    return [{ heading: "", body: normalized }];
  }
  const chunks = normalized
    .split(/\n---\n/)
    .map((c) => c.trim())
    .filter(Boolean);
  return chunks.map((chunk) => {
    const lines = chunk.split(/\r?\n/);
    const heading = (lines[0] ?? "").trim();
    const body = lines
      .slice(1)
      .join("\n")
      .trim();
    return { heading, body };
  });
}

function drawPlaceholder(doc: jsPDF, x: number, y: number, w: number, h: number, label: string) {
  doc.setDrawColor(180);
  doc.setLineWidth(0.75);
  doc.rect(x, y, w, h);
  doc.setFontSize(9);
  doc.setTextColor(120);
  const lines = doc.splitTextToSize(label, w - 16);
  let ly = y + h / 2 - (lines.length * 10) / 2;
  for (const ln of lines) {
    doc.text(ln, x + 8, ly);
    ly += 10;
  }
  doc.setTextColor(0);
}

export type LogoImage = { dataUrl: string; format: "PNG" | "JPEG" };

type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

function addLogo(doc: jsPDF, logo: LogoImage | null, yStart: number): number {
  let y = yStart;
  if (!logo) return y;
  try {
    const maxW = 140;
    const maxH = 44;
    const props = doc.getImageProperties(logo.dataUrl);
    const rw = props.width;
    const rh = props.height;
    const scale = Math.min(maxW / rw, maxH / rh, 1);
    const dw = rw * scale;
    const dh = rh * scale;
    doc.addImage(logo.dataUrl, logo.format, MARGIN, y, dw, dh);
    y += dh + 12;
  } catch {
    /* ignore broken image */
  }
  return y;
}

function addPageFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130);
    doc.text(`— ${i} of ${total} —`, PAGE_W / 2, PAGE_H - 28, { align: "center" });
    doc.setTextColor(0);
  }
}

export function buildProposalPdfBuffer(
  proposal: ProposalForPdf,
  assets: { logo: LogoImage | null; visualImages: Map<string, LogoImage> },
): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const issuer = getProposalIssuerBlock();
  const currency = proposal.currencyCode?.trim() || "XCD";
  const subject = proposalSubjectLine(proposal);

  let y = MARGIN;
  y = addLogo(doc, assets.logo, y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(issuer.name, MARGIN, y);
  y += LINE - 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const line of issuer.addressLines) {
    doc.text(line, MARGIN, y);
    y += LINE - 2;
  }
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text("Proposal for", MARGIN, y);
  y += LINE + 2;
  doc.setTextColor(0);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(subject, MARGIN, y);
  y += 20;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Commercial proposal – ${subject}`, MARGIN, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.text("Prepared for", MARGIN, y);
  y += LINE;
  doc.setFont("helvetica", "normal");
  const clientLines: string[] = [];
  if (proposal.clientLabel?.trim()) clientLines.push(proposal.clientLabel.trim());
  if (proposal.clientCompany?.trim()) clientLines.push(proposal.clientCompany.trim());
  if (proposal.clientContactName?.trim()) clientLines.push(`Attn: ${proposal.clientContactName.trim()}`);
  const addrParts = [proposal.clientEmail, proposal.clientPhone].filter((s) => s?.trim());
  if (addrParts.length) clientLines.push(addrParts.join(" · "));
  if (proposal.clientAddress?.trim()) {
    clientLines.push(...proposal.clientAddress.trim().split(/\r?\n/).filter(Boolean));
  }
  if (clientLines.length === 0) {
    clientLines.push("(Client details — edit in TL Portal)");
  }
  for (const line of clientLines) {
    doc.text(line, MARGIN, y);
    y += LINE - 1;
  }
  y += 12;

  if (proposal.executiveSummary?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text("Overview", MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    y = addParagraph(doc, proposal.executiveSummary.trim(), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1);
    y += 10;
  }

  if (y > PAGE_H - MARGIN - 140) {
    doc.addPage();
    y = MARGIN;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Solution pricing", MARGIN, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Amounts in ${currency} unless noted. Per-unit pricing; extend quantities in the table as needed.`, MARGIN, y +10);
  doc.setTextColor(0);
  y += 22;

  const sortedLines = [...proposal.lineItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const subtotal = sortedLines.reduce((acc, row) => acc + lineTotal(row), 0);

  type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const body: Cell[][] = sortedLines.map((row) => {
    const desc = `${categoryLabel(row.category)} — ${row.description}`;
    const qty = Number(row.quantity);
    const qtyStr = Number.isFinite(qty) ? String(qty) : "1";
    const unit = row.unitLabel?.trim() || "—";
    return [desc, qtyStr, unit, money(Number(row.unitPrice), currency), money(lineTotal(row), currency)];
  });
  body.push([
    {
      content: "Total (estimate)",
      colSpan: 4,
      styles: { fontStyle: "bold", halign: "right", fillColor: [245, 250, 248] },
    },
    {
      content: money(subtotal, currency),
      styles: { fontStyle: "bold", halign: "right", fillColor: [245, 250, 248] },
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Product / service details", "Qty", "Unit", `Unit price (${currency})`, `Line total (${currency})`]],
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 4, valign: "top" },
    headStyles: { fillColor: [16, 120, 72], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: {
      0: { cellWidth: 222 },
      1: { cellWidth: 34, halign: "right" },
      2: { cellWidth: 68 },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  y = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 10;

  if (proposal.pricingFootnote?.trim()) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(70);
    y = addParagraph(doc, proposal.pricingFootnote.trim(), MARGIN, y, PAGE_W - MARGIN * 2, 11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    y += 8;
  }

  if (proposal.includedFeatures?.trim()) {
    if (y > PAGE_H - MARGIN - 80) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Application feature set", MARGIN, y);
    y += LINE + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const bullets = proposal.includedFeatures.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const b of bullets) {
      if (y > PAGE_H - MARGIN - 20) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(`• ${b}`, MARGIN + 6, y);
      y += LINE - 2;
    }
    y += 10;
  }

  const sortedVisuals = [...proposal.visuals].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const vis of sortedVisuals) {
    if (y > PAGE_H - MARGIN - 140) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(vis.title, MARGIN, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const boxW = PAGE_W - MARGIN * 2;
    const boxH = 120;
    const hint = vis.placeholderHint?.trim() || "[Image placeholder]";
    const visImg = assets.visualImages.get(vis.id);
    if (visImg) {
      try {
        const props = doc.getImageProperties(visImg.dataUrl);
        const rw = props.width;
        const rh = props.height;
        const scale = Math.min(boxW / rw, boxH / rh);
        const dw = rw * scale;
        const dh = rh * scale;
        doc.addImage(visImg.dataUrl, visImg.format, MARGIN, y, dw, dh);
        y += dh + 6;
      } catch {
        drawPlaceholder(doc, MARGIN, y, boxW, boxH, hint);
        y += boxH + 6;
      }
    } else if (vis.imageUrl?.trim()) {
      drawPlaceholder(doc, MARGIN, y, boxW, boxH, `${hint}\n(Image URL set but could not be loaded.)`);
      y += boxH + 6;
    } else {
      drawPlaceholder(doc, MARGIN, y, boxW, boxH, hint);
      y += boxH + 6;
    }

    if (vis.caption?.trim()) {
      y = addParagraph(doc, vis.caption.trim(), MARGIN, y, boxW, LINE - 2);
    }
    y += 12;
  }

  if (proposal.assumptionsText?.trim()) {
    if (y > PAGE_H - MARGIN - 60) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Assumptions", MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    y = addParagraph(doc, proposal.assumptionsText.trim(), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1);
    y += 8;
  }

  if (proposal.nextStepsText?.trim()) {
    if (y > PAGE_H - MARGIN - 60) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Next steps", MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    y = addParagraph(doc, proposal.nextStepsText.trim(), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1);
    y += 8;
  }

  if (proposal.termsText?.trim()) {
    if (y > PAGE_H - MARGIN - 48) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Terms & conditions", MARGIN, y);
    y += LINE + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const blocks = parseTermsBlocks(proposal.termsText);
    for (const block of blocks) {
      if (y > PAGE_H - MARGIN - 36) {
        doc.addPage();
        y = MARGIN;
      }
      if (block.heading) {
        doc.setFont("helvetica", "bold");
        doc.text(block.heading, MARGIN, y);
        y += LINE;
      }
      doc.setFont("helvetica", "normal");
      if (block.body) {
        y = addParagraph(doc, block.body, MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1);
      }
      y += 6;
    }
  }

  const validDays = proposal.validityDays > 0 ? proposal.validityDays : 14;
  if (y > PAGE_H - MARGIN - 72) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Validity of proposal", MARGIN, y);
  y += LINE;
  doc.setFont("helvetica", "normal");
  y = addParagraph(
    doc,
    `This proposal is valid for ${validDays} days from the date of issue unless withdrawn earlier. ${issuer.name} reserves the right to adjust pricing if costs or regulations change before acceptance.`,
    MARGIN,
    y,
    PAGE_W - MARGIN * 2,
    LINE - 1,
  );
  y += 4;

  if (
    proposal.salesContactName?.trim() ||
    proposal.salesContactEmail?.trim() ||
    proposal.salesContactPhone?.trim()
  ) {
    if (y > PAGE_H - MARGIN - 56) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Designated contact", MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    if (proposal.salesContactName?.trim()) {
      const role = proposal.salesContactTitle?.trim() ? ` — ${proposal.salesContactTitle.trim()}` : "";
      doc.text(`${proposal.salesContactName.trim()}${role}`, MARGIN, y);
      y += LINE - 2;
    }
    if (proposal.salesContactEmail?.trim()) {
      doc.text(proposal.salesContactEmail.trim(), MARGIN, y);
      y += LINE - 2;
    }
    if (proposal.salesContactPhone?.trim()) {
      doc.text(proposal.salesContactPhone.trim(), MARGIN, y);
    }
  }

  addPageFooters(doc);

  const out = doc.output("arraybuffer");
  return Buffer.from(out);
}
