import "server-only";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { CustomerStatement } from "@/lib/billing/customer-statement";
import { formatMoney, formatStatementLabel } from "@/lib/billing/customer-statement";
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

function formatDocDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/St_Lucia" }).replace(/-/g, "/");
}

function placeHeaderLogo(doc: jsPDF, logo: LogoImage | null, issuerName: string, y: number): number {
  const maxW = 140;
  const maxH = 48;
  if (logo) {
    try {
      const props = doc.getImageProperties(logo.dataUrl);
      const scale = Math.min(maxW / props.width, maxH / props.height);
      doc.addImage(
        logo.dataUrl,
        logo.format === "JPEG" ? "JPEG" : "PNG",
        MARGIN,
        y,
        props.width * scale,
        props.height * scale,
      );
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

function drawTopBar(doc: jsPDF): void {
  doc.setFillColor(...PALETTE.mint);
  doc.rect(0, 0, PAGE_W, TOP_BAR_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PALETTE.green);
  doc.text("Account statement", PAGE_W / 2, TOP_BAR_H / 2 + 4, { align: "center" });
  doc.setTextColor(0);
}

function drawMetaGrid(
  doc: jsPDF,
  rows: { label: string; value: string }[],
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
    doc.setTextColor(0);
    doc.text(row.value, valueX, y, { align: "right" });
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

function drawSummaryBox(
  doc: jsPDF,
  y: number,
  cur: string,
  rows: { label: string; amount: number; bold?: boolean }[],
): number {
  const tableRight = PAGE_W - MARGIN;
  const boxW = 240;
  const boxX = tableRight - boxW;
  const rowH = 22;
  const boxH = rowH * rows.length;
  doc.setDrawColor(...PALETTE.border);
  doc.roundedRect(boxX, y, boxW, boxH, 4, 4, "S");
  let ry = y + 15;
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
    doc.text(formatMoney(row.amount, cur), boxX + boxW - 12, ry, { align: "right" });
    ry += rowH;
  }
  return y + boxH + 16;
}

export function buildCustomerStatementPdfBuffer(
  statement: CustomerStatement,
  headerLogo: LogoImage | null,
): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const issuer = getProposalIssuerBlock();
  const cur = statement.currency.toUpperCase();

  drawTopBar(doc);

  const titleY = HEADER_TOP;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...PALETTE.green);
  doc.text("Statement", PAGE_W - MARGIN, titleY, { align: "right" });
  doc.setTextColor(0);

  const periodLabel = `${formatStatementLabel(statement.periodFrom)} – ${formatStatementLabel(statement.periodTo)}`;
  const metaRows = [
    { label: "Period", value: periodLabel },
    { label: "Generated", value: formatDocDate(statement.generatedAt) },
    { label: "Customer", value: statement.customerName },
  ];

  const metaEndY = drawMetaGrid(doc, metaRows, titleY + 22);
  const brandBottom = placeHeaderLogo(doc, headerLogo, issuer.legalName, HEADER_TOP);
  let y = Math.max(brandBottom, metaEndY) + 16;

  y = drawParties(
    doc,
    [issuer.legalName, ...issuer.addressLines],
    statement.billToLines.length ? statement.billToLines : [statement.customerName],
    y,
  );

  const activityBody =
    statement.activity.length > 0
      ? statement.activity.map((row) => [
          formatDocDate(row.date),
          row.reference,
          row.description,
          row.charge > 0 ? formatMoney(row.charge, cur) : "",
          row.credit > 0 ? formatMoney(row.credit, cur) : "",
        ])
      : [["—", "—", "No activity in this period", "", ""]];

  autoTable(doc, {
    startY: y,
    head: [["Date", "Reference", "Description", "Charges", "Credits"]],
    body: activityBody,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", lineColor: PALETTE.border, lineWidth: 0.25 },
    headStyles: { fillColor: PALETTE.mintHead, textColor: PALETTE.green, fontStyle: "bold", lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: 68 },
      1: { cellWidth: 72 },
      3: { cellWidth: 72, halign: "right" },
      4: { cellWidth: 72, halign: "right" },
    },
    theme: "plain",
  });

  const tableMeta = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  y = drawSummaryBox(doc, tableMeta.finalY + 14, cur, [
    { label: "Opening balance", amount: statement.openingBalance },
    { label: "Charges (invoices issued)", amount: statement.periodCharges },
    { label: "Credits (payments received)", amount: statement.periodCredits },
    { label: "Closing balance", amount: statement.closingBalance, bold: true },
  ]);

  if (statement.outstanding.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Outstanding invoices", MARGIN, y);
    y += 14;

    autoTable(doc, {
      startY: y,
      head: [["Invoice", "Issue date", "Due date", "Amount due"]],
      body: statement.outstanding.map((row) => [
        row.number,
        formatDocDate(row.issueDate),
        row.dueDate ? formatDocDate(row.dueDate) : "—",
        formatMoney(row.amountDue, row.currency),
      ]),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", lineColor: PALETTE.border, lineWidth: 0.25 },
      headStyles: { fillColor: PALETTE.mintHead, textColor: PALETTE.green, fontStyle: "bold", lineWidth: 0 },
      columnStyles: {
        3: { halign: "right" },
      },
      theme: "plain",
    });
  }

  doc.setFontSize(7);
  doc.setTextColor(...PALETTE.label);
  doc.text(
    "Opening balance is the amount still owing on invoices issued before this period. Closing balance = opening + charges − credits.",
    MARGIN,
    FOOTER_Y,
  );

  return Buffer.from(doc.output("arraybuffer"));
}
