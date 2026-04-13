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

function drawPlaceholder(doc: jsPDF, x: number, y: number, w: number, h: number, label: string) {
  doc.setDrawColor(180);
  doc.setLineWidth(0.75);
  doc.rect(x, y, w, h);
  doc.setFontSize(9);
  doc.setTextColor(120);
  const lines = doc.splitTextToSize(label, w - 16);
  let ly = y + h / 2 - (lines.length * 10) / 2;
  for (const ln of lines) {
    doc.text(ln, x +8, ly);
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

export function buildProposalPdfBuffer(
  proposal: ProposalForPdf,
  assets: { logo: LogoImage | null; visualImages: Map<string, LogoImage> },
): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const issuer = getProposalIssuerBlock();
  const currency = proposal.currencyCode?.trim() || "XCD";

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
  y += 8;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Proposal", MARGIN, y);
  y += 22;
  doc.setFontSize(12);
  doc.text(proposal.title, MARGIN, y);
  y += 20;

  doc.setFontSize(10);
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
  y += 10;

  if (proposal.executiveSummary?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text("Summary", MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    y = addParagraph(doc, proposal.executiveSummary.trim(), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1);
    y += 8;
  }

  if (proposal.includedFeatures?.trim()) {
    if (y > PAGE_H - MARGIN - 80) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Included capabilities", MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    const bullets = proposal.includedFeatures.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const b of bullets) {
      if (y > PAGE_H - MARGIN - 20) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(`• ${b}`, MARGIN + 6, y);
      y += LINE - 2;
    }
    y += 8;
  }

  if (y > PAGE_H - MARGIN - 120) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFont("helvetica", "bold");
  doc.text("Commercial summary", MARGIN, y);
  y += 6;

  const sortedLines = [...proposal.lineItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const body = sortedLines.map((row) => {
    const desc = `[${categoryLabel(row.category)}] ${row.description}`;
    const qty = Number(row.quantity);
    const qtyStr = Number.isFinite(qty) ? String(qty) : "1";
    const unit = row.unitLabel?.trim() || "—";
    return [desc, qtyStr, unit, money(Number(row.unitPrice), currency), money(lineTotal(row), currency)];
  });

  autoTable(doc, {
    startY: y + 8,
    head: [["Description", "Qty", "Unit", "Unit price", "Line total"]],
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [16, 120, 72], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth:230 },
      1: { cellWidth: 36, halign: "right" },
      2: { cellWidth: 72 },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  y = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 8;

  if (proposal.pricingFootnote?.trim()) {
    doc.setFontSize(8);
    doc.setTextColor(80);
    y = addParagraph(doc, proposal.pricingFootnote.trim(), MARGIN, y, PAGE_W - MARGIN * 2, 11);
    doc.setTextColor(0);
    y += 6;
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
    if (y > PAGE_H - MARGIN - 40) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Terms", MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y = addParagraph(doc, proposal.termsText.trim(), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1);
    y += 8;
  }

  const validDays = proposal.validityDays > 0 ? proposal.validityDays : 14;
  if (y > PAGE_H - MARGIN - 72) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Validity", MARGIN, y);
  y += LINE;
  doc.setFont("helvetica", "normal");
  doc.text(`This proposal is offered for ${validDays} days from the date of issue unless withdrawn earlier.`, MARGIN, y);
  y += LINE + 4;

  if (
    proposal.salesContactName?.trim() ||
    proposal.salesContactEmail?.trim() ||
    proposal.salesContactPhone?.trim()
  ) {
    doc.setFont("helvetica", "bold");
    doc.text("Questions", MARGIN, y);
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

  const out = doc.output("arraybuffer");
  return Buffer.from(out);
}
