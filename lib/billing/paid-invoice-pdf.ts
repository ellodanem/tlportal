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
const FOOTER_Y = PAGE_H - 36;

const NEUTRAL = {
  border: [200, 200, 200] as [number, number, number],
  headBg: [236, 253, 245] as [number, number, number],
  paidGreen: [22, 101, 52] as [number, number, number],
  paidBanner: [220, 252, 231] as [number, number, number],
  muted: [82, 82, 91] as [number, number, number],
};

function money(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const formatted = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-029", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${code} ${formatted}`;
}

function formatPdfDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function placeHeaderLogo(doc: jsPDF, logo: LogoImage | null, y: number): number {
  if (!logo) return y;
  const maxW = 120;
  const maxH = 40;
  try {
    doc.addImage(logo.dataUrl, logo.format, MARGIN, y, maxW, maxH, undefined, "FAST");
    return y + maxH + 8;
  } catch {
    return y;
  }
}

function drawPaidWatermark(doc: jsPDF): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(72);
  doc.setTextColor(190, 190, 190);
  doc.text("PAID", PAGE_W / 2, PAGE_H / 2 + 20, { align: "center", angle: 35 });
  doc.setTextColor(0);
}

function drawPaidBanner(doc: jsPDF, paidAt: Date, y: number): number {
  doc.setFillColor(...NEUTRAL.paidBanner);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...NEUTRAL.paidGreen);
  doc.text(`PAID IN FULL — ${formatPdfDate(paidAt)}`, MARGIN + 12, y + 18);
  doc.setTextColor(0);
  return y + 36;
}

export function buildPaidInvoicePdfBuffer(input: PaidInvoicePdfInput): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const issuer = getProposalIssuerBlock();
  const lines = parseStripeInvoicePdfLines(input.stripeInvoice);
  const totals = stripeInvoiceTotals(input.stripeInvoice);
  const cur = input.currency.toUpperCase();

  drawPaidWatermark(doc);

  let y = MARGIN;
  y = placeHeaderLogo(doc, input.headerLogo, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(issuer.legalName, MARGIN, y);
  y += 14;
  if (issuer.brandLine) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(issuer.brandLine, MARGIN, y);
    y += 12;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...NEUTRAL.muted);
  for (const line of issuer.addressLines) {
    doc.text(line, MARGIN, y);
    y += 10;
  }
  doc.setTextColor(0);
  y += 4;

  y = drawPaidBanner(doc, input.paidAt, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("INVOICE", PAGE_W - MARGIN, y, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...NEUTRAL.muted);
  doc.text("Receipt", PAGE_W - MARGIN, y + 14, { align: "right" });
  doc.setTextColor(0);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Invoice #: ${input.displayNumber}`, PAGE_W - MARGIN, y, { align: "right" });
  y += 16;
  doc.setFontSize(11);
  doc.setTextColor(...NEUTRAL.paidGreen);
  doc.text(`Balance due: ${money(0, cur)}`, PAGE_W - MARGIN, y, { align: "right" });
  doc.setTextColor(0);
  y += 20;

  const metaX = PAGE_W - MARGIN - 200;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const invoiceDate =
    input.stripeInvoice.status_transitions?.finalized_at != null
      ? new Date(input.stripeInvoice.status_transitions.finalized_at * 1000)
      : input.paidAt;
  doc.text(`Invoice date: ${formatPdfDate(invoiceDate)}`, metaX, y);
  y += 12;
  doc.text(`Paid date: ${formatPdfDate(input.paidAt)}`, metaX, y);
  y += 12;
  doc.text(`Terms: Paid in full`, metaX, y);
  y += 12;
  if (input.paymentMethodLabel) {
    doc.text(`Payment: ${input.paymentMethodLabel}`, metaX, y);
    y += 12;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Bill to", MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  for (const line of customerBillToLines(input.customer)) {
    doc.text(line, MARGIN, y);
    y += 12;
  }
  y += 8;

  const tableBody = lines.map((row: PaidInvoicePdfLine) => [
    String(row.index),
    row.description,
    row.qty,
    money(row.rate, cur),
    money(row.amount, cur),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Item & description", "Qty", "Rate", "Amount"]],
    body: tableBody,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: NEUTRAL.headBg, textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 32, halign: "right" },
      3: { cellWidth: 72, halign: "right" },
      4: { cellWidth: 72, halign: "right" },
    },
    theme: "grid",
  });

  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  let ty = afterTable;

  const summaryX = PAGE_W - MARGIN - 220;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Subtotal: ${money(totals.subtotal, cur)}`, summaryX, ty, { align: "left" });
  ty += 12;
  if (totals.discount > 0) {
    doc.text(`Discount: −${money(totals.discount, cur)}`, summaryX, ty);
    ty += 12;
  }
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${money(totals.total, cur)}`, summaryX, ty);
  ty += 14;
  doc.text(`Payment received: ${money(totals.amountPaid, cur)}`, summaryX, ty);
  ty += 16;

  doc.setFillColor(...NEUTRAL.paidBanner);
  doc.rect(summaryX - 8, ty - 4, 228, 22, "F");
  doc.setTextColor(...NEUTRAL.paidGreen);
  doc.text(`Balance due ${money(0, cur)}`, summaryX, ty + 10);
  doc.setTextColor(0);
  ty += 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Thank you for your business.", MARGIN, ty);
  ty += 20;

  doc.setFontSize(7);
  doc.setTextColor(...NEUTRAL.muted);
  const refs: string[] = [`Stripe ref: ${input.externalInvoiceId}`];
  if (input.providerInvoiceNumber) {
    refs.push(`Stripe invoice #: ${input.providerInvoiceNumber}`);
  }
  doc.text(refs.join("  ·  "), MARGIN, FOOTER_Y, { maxWidth: PAGE_W - MARGIN * 2 });

  return Buffer.from(doc.output("arraybuffer"));
}
