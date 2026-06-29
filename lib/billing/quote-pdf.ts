import "server-only";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { getProposalIssuerBlock } from "@/lib/proposals/issuer";
import type { LogoImage } from "@/lib/proposals/pdf";

const MARGIN = 48;
const PAGE_W = 612;
const PAGE_H = 792;
const FOOTER_Y = PAGE_H - 32;
const TOP_BAR_H = 26;
const HEADER_TOP = TOP_BAR_H + 20;

const PALETTE = {
  green: [22, 101, 52] as [number, number, number],
  mint: [220, 252, 231] as [number, number, number],
  mintHead: [236, 253, 245] as [number, number, number],
  label: [113, 113, 122] as [number, number, number],
  border: [228, 228, 231] as [number, number, number],
};

export type QuotePdfLine = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type QuotePdfInput = {
  quoteNumber: string;
  quoteDate: Date;
  validUntil: Date;
  currency: string;
  billToLines: string[];
  lineItems: QuotePdfLine[];
  notes: string | null;
  headerLogo: LogoImage | null;
};

function money(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const formatted = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-029", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (code === "XCD") return `EC$${formatted}`;
  return `${code} ${formatted}`;
}

function formatDocDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function placeHeaderLogo(doc: jsPDF, logo: LogoImage | null, issuerName: string, y: number): number {
  const maxW = 140;
  const maxH = 48;

  if (logo) {
    try {
      const props = doc.getImageProperties(logo.dataUrl);
      const scale = Math.min(maxW / props.width, maxH / props.height);
      const dw = props.width * scale;
      const dh = props.height * scale;
      const fmt = logo.format === "JPEG" ? "JPEG" : "PNG";
      doc.addImage(logo.dataUrl, fmt, MARGIN, y, dw, dh);
      return y + dh + 12;
    } catch {
      // fall through to text fallback
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PALETTE.green);
  doc.text(issuerName.toUpperCase(), MARGIN, y + 22);
  doc.setTextColor(0);

  return y + 36 + 12;
}

function drawTopQuoteBar(doc: jsPDF): void {
  doc.setFillColor(...PALETTE.mint);
  doc.rect(0, 0, PAGE_W, TOP_BAR_H, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PALETTE.green);
  doc.text("Quote / estimate", PAGE_W / 2, TOP_BAR_H / 2 + 4, { align: "center" });
  doc.setTextColor(0);
}

function drawMetaGrid(
  doc: jsPDF,
  rows: { label: string; value: string; valueGreen?: boolean }[],
  topY: number,
): number {
  const labelX = PAGE_W - MARGIN - 168;
  const valueX = PAGE_W - MARGIN;
  let y = topY;

  for (const row of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PALETTE.label);
    doc.text(row.label, labelX, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (row.valueGreen) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PALETTE.green);
    } else {
      doc.setTextColor(0);
    }
    doc.text(row.value, valueX, y, { align: "right" });
    doc.setTextColor(0);
    y += 14;
  }

  return y;
}

function drawParties(doc: jsPDF, fromLines: string[], billToLines: string[], y: number): number {
  const colW = (PAGE_W - MARGIN * 2) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PALETTE.label);
  doc.text("From", leftX, y);
  doc.text("Quote for", rightX, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  if (fromLines[0]) doc.text(fromLines[0], leftX, y);
  if (billToLines[0]) doc.text(billToLines[0], rightX, y);
  y += 13;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const fromRest = fromLines.slice(1);
  const billRest = billToLines.slice(1);
  const maxRows = Math.max(fromRest.length, billRest.length);

  for (let i = 0; i < maxRows; i++) {
    if (fromRest[i]) doc.text(fromRest[i], leftX, y);
    if (billRest[i]) doc.text(billRest[i], rightX, y);
    y += 12;
  }

  return y + 10;
}

function drawTotalsBox(
  doc: jsPDF,
  subtotal: number,
  total: number,
  cur: string,
  tableRight: number,
  y: number,
): number {
  const boxW = 220;
  const boxX = tableRight - boxW;
  const rowH = 22;
  const boxH = rowH * 2;

  doc.setDrawColor(...PALETTE.border);
  doc.setLineWidth(0.5);
  doc.roundedRect(boxX, y, boxW, boxH, 4, 4, "S");

  let ry = y + 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text("Subtotal", boxX + 12, ry);
  doc.text(money(subtotal, cur), boxX + boxW - 12, ry, { align: "right" });
  ry += rowH;

  doc.setFillColor(...PALETTE.mint);
  doc.roundedRect(boxX, y + boxH - rowH, boxW, rowH, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PALETTE.green);
  doc.text("Total", boxX + 12, y + boxH - 7);
  doc.text(money(total, cur), boxX + boxW - 12, y + boxH - 7, { align: "right" });
  doc.setTextColor(0);

  return y + boxH + 16;
}

export function buildQuotePdfBuffer(input: QuotePdfInput): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const issuer = getProposalIssuerBlock();
  const cur = input.currency.toUpperCase();

  const subtotal = input.lineItems.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const total = subtotal;

  drawTopQuoteBar(doc);

  const titleY = HEADER_TOP;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...PALETTE.green);
  doc.text("Quote", PAGE_W - MARGIN, titleY, { align: "right" });
  doc.setTextColor(0);

  const metaStartY = titleY + 22;
  const metaEndY = drawMetaGrid(
    doc,
    [
      { label: "Number", value: input.quoteNumber },
      { label: "Date", value: formatDocDate(input.quoteDate) },
      { label: "Valid until", value: formatDocDate(input.validUntil) },
      { label: "Status", value: "Estimate", valueGreen: true },
    ],
    metaStartY,
  );

  const brandBottom = placeHeaderLogo(doc, input.headerLogo, issuer.legalName, HEADER_TOP);
  let y = Math.max(brandBottom, metaEndY) + 16;

  const fromLines = [issuer.legalName, ...issuer.addressLines];
  const billTo = input.billToLines.length ? input.billToLines : ["Customer"];
  y = drawParties(doc, fromLines, billTo, y);

  const tableBody = input.lineItems.map((row, index) => [
    String(index + 1),
    row.description,
    String(row.quantity),
    money(row.unitPrice, cur),
    money(row.quantity * row.unitPrice, cur),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Quantity", "Unit price", "Amount"]],
    body: tableBody,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      fontSize: 9,
      cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
      overflow: "linebreak",
      lineColor: PALETTE.border,
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: PALETTE.mintHead,
      textColor: PALETTE.green,
      fontStyle: "bold",
      lineWidth: 0,
    },
    bodyStyles: { textColor: [30, 30, 30] },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 52, halign: "center" },
      3: { cellWidth: 72, halign: "right" },
      4: { cellWidth: 72, halign: "right" },
    },
    theme: "plain",
    tableLineColor: PALETTE.border,
    tableLineWidth: 0.25,
  });

  const tableMeta = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  const tableRight = PAGE_W - MARGIN;
  let ty = drawTotalsBox(doc, subtotal, total, cur, tableRight, tableMeta.finalY + 14);

  if (input.notes?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("Notes", MARGIN, ty);
    ty += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PALETTE.label);
    const noteLines = doc.splitTextToSize(input.notes.trim(), PAGE_W - MARGIN * 2);
    doc.text(noteLines, MARGIN, ty);
    ty += noteLines.length * 10 + 8;
  }

  doc.setFontSize(7);
  doc.setTextColor(...PALETTE.label);
  doc.text(
    "This quote is an estimate only and is not a tax invoice. Pricing may change before formal acceptance.",
    MARGIN,
    Math.min(ty + 8, FOOTER_Y - 4),
    { maxWidth: PAGE_W - MARGIN * 2 },
  );

  return Buffer.from(doc.output("arraybuffer"));
}

/** Suggested quote number for the admin form (not guaranteed unique). */
export function suggestQuoteNumber(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const tail = String(now.getTime()).slice(-4);
  return `TL-Q-${y}${m}${d}-${tail}`;
}
