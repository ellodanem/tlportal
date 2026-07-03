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

export type NativeInvoicePdfLine = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type NativeInvoicePdfInput = {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  billToLines: string[];
  lineItems: NativeInvoicePdfLine[];
  subtotal: number;
  discountTotal: number;
  taxLabel: string | null;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  notes: string | null;
  paymentInstructions: string | null;
  isPaid: boolean;
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
      doc.addImage(logo.dataUrl, logo.format === "JPEG" ? "JPEG" : "PNG", MARGIN, y, props.width * scale, props.height * scale);
      return y + props.height * scale + 12;
    } catch {
      /* fallback */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PALETTE.green);
  doc.text(issuerName.toUpperCase(), MARGIN, y + 22);
  doc.setTextColor(0);
  return y + 36 + 12;
}

function drawTopBar(doc: jsPDF, isPaid: boolean): void {
  doc.setFillColor(...PALETTE.mint);
  doc.rect(0, 0, PAGE_W, TOP_BAR_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PALETTE.green);
  doc.text(isPaid ? "Tax invoice — paid" : "Tax invoice", PAGE_W / 2, TOP_BAR_H / 2 + 4, { align: "center" });
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
  doc.setFontSize(8);
  doc.setTextColor(...PALETTE.label);
  doc.text("From", leftX, y);
  doc.text("Bill to", rightX, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  if (fromLines[0]) doc.text(fromLines[0], leftX, y);
  if (billToLines[0]) doc.text(billToLines[0], rightX, y);
  y += 13;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const maxRows = Math.max(fromLines.length - 1, billToLines.length - 1);
  for (let i = 0; i < maxRows; i++) {
    if (fromLines[i + 1]) doc.text(fromLines[i + 1], leftX, y);
    if (billToLines[i + 1]) doc.text(billToLines[i + 1], rightX, y);
    y += 12;
  }
  return y + 10;
}

export function buildNativeInvoicePdfBuffer(input: NativeInvoicePdfInput): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const issuer = getProposalIssuerBlock();
  const cur = input.currency.toUpperCase();

  drawTopBar(doc, input.isPaid);

  const titleY = HEADER_TOP;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...PALETTE.green);
  doc.text("Invoice", PAGE_W - MARGIN, titleY, { align: "right" });
  doc.setTextColor(0);

  const metaRows: { label: string; value: string; valueGreen?: boolean }[] = [
    { label: "Invoice #", value: input.invoiceNumber },
    { label: "Date", value: formatDocDate(input.issueDate) },
  ];
  if (input.dueDate) {
    metaRows.push({ label: "Due date", value: formatDocDate(input.dueDate) });
  }
  metaRows.push({
    label: "Status",
    value: input.isPaid ? "Paid" : "Open",
    valueGreen: input.isPaid,
  });

  const metaEndY = drawMetaGrid(doc, metaRows, titleY + 22);
  const brandBottom = placeHeaderLogo(doc, input.headerLogo, issuer.legalName, HEADER_TOP);
  let y = Math.max(brandBottom, metaEndY) + 16;

  y = drawParties(doc, [issuer.legalName, ...issuer.addressLines], input.billToLines.length ? input.billToLines : ["Customer"], y);

  const tableBody = input.lineItems.map((row, index) => [
    String(index + 1),
    row.description,
    String(row.quantity),
    money(row.unitPrice, cur),
    money(row.quantity * row.unitPrice, cur),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Qty", "Unit price", "Amount"]],
    body: tableBody,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", lineColor: PALETTE.border, lineWidth: 0.25 },
    headStyles: { fillColor: PALETTE.mintHead, textColor: PALETTE.green, fontStyle: "bold", lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 40, halign: "center" },
      3: { cellWidth: 72, halign: "right" },
      4: { cellWidth: 72, halign: "right" },
    },
    theme: "plain",
  });

  const tableMeta = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  const tableRight = PAGE_W - MARGIN;
  const boxW = 220;
  const boxX = tableRight - boxW;
  let ty = tableMeta.finalY + 14;

  const rows: { label: string; amount: number; bold?: boolean; negative?: boolean }[] = [
    { label: "Subtotal", amount: input.subtotal },
  ];
  if (input.discountTotal > 0) {
    rows.push({ label: "Discount", amount: input.discountTotal, negative: true });
  }
  if (input.taxTotal > 0) {
    rows.push({ label: input.taxLabel ?? "Tax", amount: input.taxTotal });
  }
  rows.push({ label: "Total", amount: input.total, bold: true });
  if (input.amountPaid > 0) {
    rows.push({ label: "Paid", amount: input.amountPaid });
    rows.push({ label: "Amount due", amount: input.amountDue, bold: true });
  }

  const rowH = 22;
  const boxH = rowH * rows.length;
  doc.setDrawColor(...PALETTE.border);
  doc.roundedRect(boxX, ty, boxW, boxH, 4, 4, "S");
  let ry = ty + 15;
  for (const row of rows) {
    if (row.bold) {
      doc.setFillColor(...PALETTE.mint);
      doc.rect(boxX, ry - 12, boxW, rowH, "F");
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(row.label, boxX + 12, ry);
    const amountText = row.negative ? `−${money(row.amount, cur)}` : money(row.amount, cur);
    doc.text(amountText, boxX + boxW - 12, ry, { align: "right" });
    ry += rowH;
  }
  ty += boxH + 16;

  if (input.paymentInstructions?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Payment instructions", MARGIN, ty);
    ty += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PALETTE.label);
    const lines = doc.splitTextToSize(input.paymentInstructions.trim(), PAGE_W - MARGIN * 2);
    doc.text(lines, MARGIN, ty);
    ty += lines.length * 10 + 8;
    doc.setTextColor(0);
  }

  if (input.notes?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes", MARGIN, ty);
    ty += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PALETTE.label);
    const noteLines = doc.splitTextToSize(input.notes.trim(), PAGE_W - MARGIN * 2);
    doc.text(noteLines, MARGIN, ty);
  }

  if (input.isPaid) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(34, 197, 94);
    doc.text("PAID", PAGE_W / 2, PAGE_H / 2, { align: "center", angle: 25 });
    doc.setTextColor(0);
  }

  doc.setFontSize(7);
  doc.setTextColor(...PALETTE.label);
  doc.text("Thank you for your business.", MARGIN, FOOTER_Y);

  return Buffer.from(doc.output("arraybuffer"));
}
