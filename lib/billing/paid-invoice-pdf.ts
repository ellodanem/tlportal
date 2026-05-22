import "server-only";

import type { Customer } from "@prisma/client";
import type Stripe from "stripe";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { getProposalIssuerBlock } from "@/lib/proposals/issuer";
import type { LogoImage } from "@/lib/proposals/pdf";

import { customerBillToLines } from "./customer-bill-to";
import {
  parseStripeInvoicePdfLines,
  stripeInvoiceTotals,
  type PaidInvoicePdfLine,
} from "./stripe-invoice-for-pdf";

export type PaidInvoicePdfInput = {
  displayNumber: string;
  providerInvoiceNumber: string | null;
  externalInvoiceId: string;
  currency: string;
  customer: Customer;
  stripeInvoice: Stripe.Invoice;
  paidAt: Date;
  paymentMethodLabel: string | null;
  headerLogo: LogoImage | null;
};

const MARGIN = 48;
const PAGE_W = 612;
const PAGE_H = 792;
const FOOTER_Y = PAGE_H - 32;

/** Invoiceless-inspired palette — mint accents, forest green type. */
const PALETTE = {
  green: [22, 101, 52] as [number, number, number],
  mint: [220, 252, 231] as [number, number, number],
  mintHead: [236, 253, 245] as [number, number, number],
  label: [113, 113, 122] as [number, number, number],
  border: [228, 228, 231] as [number, number, number],
};

const TOP_BAR_H = 26;
const HEADER_TOP = TOP_BAR_H + 20;

function money(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const formatted = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-029", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (code === "XCD") return `EC$${formatted}`;
  return `${code} ${formatted}`;
}

function formatInvoiceDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function placeBrandMark(doc: jsPDF, logo: LogoImage | null, issuerName: string, y: number): number {
  const markSize = 36;
  let textX = MARGIN;

  if (logo) {
    try {
      const props = doc.getImageProperties(logo.dataUrl);
      const scale = Math.min(markSize / props.width, markSize / props.height, 1);
      const dw = props.width * scale;
      const dh = props.height * scale;
      const fmt = logo.format === "JPEG" ? "JPEG" : "PNG";
      doc.addImage(logo.dataUrl, fmt, MARGIN, y, dw, dh);
      textX = MARGIN + markSize + 10;
    } catch {
      textX = MARGIN;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PALETTE.green);
  doc.text(issuerName.toUpperCase(), textX, y + 22);
  doc.setTextColor(0);

  return y + markSize + 12;
}

function drawTopPaidBar(doc: jsPDF): void {
  doc.setFillColor(...PALETTE.mint);
  doc.rect(0, 0, PAGE_W, TOP_BAR_H, "F");

  const cx = PAGE_W / 2;
  const cy = TOP_BAR_H / 2 + 4;
  doc.setDrawColor(...PALETTE.green);
  doc.setLineWidth(1.2);
  doc.line(cx - 14, cy, cx - 8, cy + 5);
  doc.line(cx - 8, cy + 5, cx + 2, cy - 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PALETTE.green);
  doc.text("Paid", cx + 8, cy + 3);
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

function drawParties(
  doc: jsPDF,
  fromLines: string[],
  billToLines: string[],
  y: number,
): number {
  const colW = (PAGE_W - MARGIN * 2) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PALETTE.label);
  doc.text("From", leftX, y);
  doc.text("Bill to", rightX, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  if (fromLines[0]) {
    doc.text(fromLines[0], leftX, y);
  }
  if (billToLines[0]) {
    doc.text(billToLines[0], rightX, y);
  }
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
  discount: number,
  total: number,
  cur: string,
  tableRight: number,
  y: number,
): number {
  const boxW = 220;
  const boxX = tableRight - boxW;
  const rowH = 22;
  const rows = discount > 0 ? 3 : 2;
  const boxH = rowH * rows;

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

  if (discount > 0) {
    doc.text("Discount", boxX + 12, ry);
    doc.text(`−${money(discount, cur)}`, boxX + boxW - 12, ry, { align: "right" });
    ry += rowH;
  }

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

export function buildPaidInvoicePdfBuffer(input: PaidInvoicePdfInput): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const issuer = getProposalIssuerBlock();
  const lines = parseStripeInvoicePdfLines(input.stripeInvoice);
  const totals = stripeInvoiceTotals(input.stripeInvoice);
  const cur = input.currency.toUpperCase();

  const invoiceDate =
    input.stripeInvoice.status_transitions?.finalized_at != null
      ? new Date(input.stripeInvoice.status_transitions.finalized_at * 1000)
      : input.paidAt;

  const dueTimestamp = input.stripeInvoice.due_date ?? input.stripeInvoice.status_transitions?.finalized_at;
  const dueDate = dueTimestamp != null ? new Date(dueTimestamp * 1000) : invoiceDate;

  drawTopPaidBar(doc);

  const titleY = HEADER_TOP;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...PALETTE.green);
  doc.text("Invoice", PAGE_W - MARGIN, titleY, { align: "right" });
  doc.setTextColor(0);

  const metaStartY = titleY + 12;
  const metaEndY = drawMetaGrid(doc, [
    { label: "Number", value: input.displayNumber },
    { label: "Date", value: formatInvoiceDate(invoiceDate) },
    { label: "Due date", value: formatInvoiceDate(dueDate) },
    { label: "Status", value: "Paid", valueGreen: true },
  ], metaStartY);

  const brandBottom = placeBrandMark(doc, input.headerLogo, issuer.legalName, HEADER_TOP);
  let y = Math.max(brandBottom, metaEndY) + 16;

  const fromLines = [issuer.legalName, ...issuer.addressLines];
  y = drawParties(doc, fromLines, customerBillToLines(input.customer), y);

  const tableBody = lines.map((row: PaidInvoicePdfLine) => [
    String(row.index),
    row.description,
    row.qty,
    money(row.rate, cur),
    money(row.amount, cur),
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
  let ty = drawTotalsBox(doc, totals.subtotal, totals.discount, totals.total, cur, tableRight, tableMeta.finalY + 14);

  if (input.paymentMethodLabel) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PALETTE.label);
    doc.text(`Paid via ${input.paymentMethodLabel}`, MARGIN, ty);
    ty += 12;
  }

  doc.setFontSize(7);
  doc.setTextColor(...PALETTE.label);
  const refs: string[] = [`Stripe: ${input.externalInvoiceId}`];
  if (input.providerInvoiceNumber) {
    refs.push(`Stripe #${input.providerInvoiceNumber}`);
  }
  doc.text(refs.join("  ·  "), MARGIN, FOOTER_Y, { maxWidth: PAGE_W - MARGIN * 2 });

  return Buffer.from(doc.output("arraybuffer"));
}
