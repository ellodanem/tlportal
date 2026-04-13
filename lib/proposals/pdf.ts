import "server-only";

import type { Proposal, ProposalLineItem, ProposalVisualBlock } from "@prisma/client";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  footerPageText,
  formatValidityBody,
  pricingIntroLine,
  PROPOSAL_TEMPLATE,
  tableHeadCol3,
} from "@/lib/proposals/proposal-template";
import { parseTimelineSteps, type TimelineStep } from "@/lib/proposals/visual-timeline";

export type ProposalForPdf = Proposal & {
  lineItems: ProposalLineItem[];
  visuals: ProposalVisualBlock[];
};

const MARGIN = 48;
const LINE = 14;
const PAGE_W = 612;
const PAGE_H = 792;
const FOOTER_Y = PAGE_H - 28;
const CONTENT_BOTTOM = PAGE_H - 40;

const NEUTRAL = {
  border: [200, 200, 200] as [number, number, number],
  headBg: [245, 245, 245] as [number, number, number],
  stripe: [252, 252, 252] as [number, number, number],
  muted: [82, 82, 91] as [number, number, number],
};

type ProposalLayoutCtx = {
  pageNum: number;
  continuedContentY: number;
};

function money(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toLocaleString("en-029", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

function lineTotal(item: ProposalLineItem): number {
  const q = Number(item.quantity);
  const p = Number(item.unitPrice);
  return (Number.isFinite(q) ? q : 0) * (Number.isFinite(p) ? p : 0);
}

function formatQty(q: unknown): string {
  const n = Number(q);
  return String(Number.isFinite(n) ? n : 0);
}

function drawContinuedLetterhead(doc: jsPDF): void {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(PROPOSAL_TEMPLATE.headerLine1, MARGIN, MARGIN + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(PROPOSAL_TEMPLATE.headerLine2, MARGIN, MARGIN + 22);
}

function newPage(doc: jsPDF, ctx: ProposalLayoutCtx): number {
  doc.addPage();
  ctx.pageNum += 1;
  drawContinuedLetterhead(doc);
  return ctx.continuedContentY;
}

export type CoverPageAssets = {
  headerLogo: LogoImage | null;
  centerBrandLogo: LogoImage | null;
};

type CoverProposalFields = Pick<
  ProposalForPdf,
  | "title"
  | "clientLabel"
  | "clientCompany"
  | "clientContactName"
  | "clientEmail"
  | "clientPhone"
  | "clientAddress"
>;

/** Cover page 1 only (header logo, centered title + product mark, Prepared for). Returns Y after client block. */
export function drawProposalCoverPage(
  doc: jsPDF,
  proposal: CoverProposalFields,
  assets: CoverPageAssets,
): number {
  placeHeaderLogoTopLeft(doc, assets.headerLogo);

  const subject = proposal.title.trim() || PROPOSAL_TEMPLATE.defaultSubject;

  let yc = MARGIN + 108;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...NEUTRAL.muted);
  doc.text(PROPOSAL_TEMPLATE.proposalForLabel, PAGE_W / 2, yc, { align: "center" });
  yc += 18;
  doc.setTextColor(0);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text(subject, PAGE_W / 2, yc, { align: "center" });
  yc += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  yc = placeCenterBrandLogo(doc, assets.centerBrandLogo, yc);

  const yPrepared = Math.max(yc + 52, 312);
  let y = yPrepared;

  doc.setFont("helvetica", "bold");
  doc.text(PROPOSAL_TEMPLATE.preparedForLabel, MARGIN, y);
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
  return y + 12;
}

/** One-page PDF to verify cover layout (sample “Prepared for” copy). */
export function buildProposalCoverSamplePdfBuffer(assets: CoverPageAssets): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  drawProposalCoverPage(doc, COVER_SAMPLE_PROPOSAL_FIELDS, assets);
  addPageFooters(doc);
  return Buffer.from(doc.output("arraybuffer"));
}

const COVER_SAMPLE_PROPOSAL_FIELDS: CoverProposalFields = {
  title: PROPOSAL_TEMPLATE.defaultSubject,
  clientLabel: "Sample Contact",
  clientCompany: "Sample Fleet Co.",
  clientContactName: "Alex Example",
  clientEmail: "alex@example.com",
  clientPhone: "(758) 555-0100",
  clientAddress: null,
};

/** Ellodane / company mark — top-left of cover page. */
function placeHeaderLogoTopLeft(doc: jsPDF, logo: LogoImage | null): void {
  if (!logo) return;
  try {
    const maxW = 150;
    const maxH = 48;
    const props = doc.getImageProperties(logo.dataUrl);
    const scale = Math.min(maxW / props.width, maxH / props.height, 1);
    const dw = props.width * scale;
    const dh = props.height * scale;
    doc.addImage(logo.dataUrl, logo.format, MARGIN, MARGIN, dw, dh);
  } catch {
    /* ignore broken image */
  }
}

/** Track Lucia (or product) mark — centered under the proposal title. Returns Y below the image. */
function placeCenterBrandLogo(doc: jsPDF, logo: LogoImage | null, yTop: number): number {
  if (!logo) return yTop + 4;
  try {
    const maxW = 220;
    const maxH = 72;
    const props = doc.getImageProperties(logo.dataUrl);
    const scale = Math.min(maxW / props.width, maxH / props.height, 1);
    const dw = props.width * scale;
    const dh = props.height * scale;
    const x = (PAGE_W - dw) / 2;
    doc.addImage(logo.dataUrl, logo.format, x, yTop, dw, dh);
    return yTop + dh + 14;
  } catch {
    return yTop + 4;
  }
}

function addParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  ctx?: ProposalLayoutCtx,
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  const bottom = ctx ? CONTENT_BOTTOM : PAGE_H - MARGIN - lineHeight;
  for (const line of lines) {
    if (y > bottom - lineHeight) {
      if (ctx) {
        y = newPage(doc, ctx);
      } else {
        doc.addPage();
        y = MARGIN;
      }
    }
    doc.setTextColor(0);
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

function addPageFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i === 1) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100);
      doc.text(PROPOSAL_TEMPLATE.headerLine1, PAGE_W / 2, PAGE_H - 50, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text(PROPOSAL_TEMPLATE.headerLine2, PAGE_W / 2, PAGE_H - 36, { align: "center" });
    }
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130);
    doc.text(footerPageText(i, total), PAGE_W / 2, FOOTER_Y, { align: "center" });
    doc.setTextColor(0);
  }
}

const TIMELINE_FALLBACK: TimelineStep[] = [
  { title: "Order", detail: "1–3 business days" },
  { title: "Install", detail: "20–45 min / vehicle" },
  { title: "Go live", detail: "Same day when online" },
];

function ensureVisualSpace(doc: jsPDF, y: number, minBelow: number, ctx: ProposalLayoutCtx): number {
  if (y > CONTENT_BOTTOM - minBelow) {
    return newPage(doc, ctx);
  }
  return y;
}

function renderMediaArea(
  doc: jsPDF,
  vis: ProposalVisualBlock,
  x: number,
  y: number,
  areaW: number,
  boxH: number,
  assets: Map<string, LogoImage>,
): number {
  const hint = vis.placeholderHint?.trim() || "[Image placeholder]";
  const visImg = assets.get(vis.id);
  let usedH = 0;
  if (visImg) {
    try {
      const props = doc.getImageProperties(visImg.dataUrl);
      const scale = Math.min(areaW / props.width, boxH / props.height);
      const dw = props.width * scale;
      const dh = props.height * scale;
      doc.addImage(visImg.dataUrl, visImg.format, x, y, dw, dh);
      usedH = dh;
    } catch {
      drawPlaceholder(doc, x, y, areaW, boxH, hint);
      usedH = boxH;
    }
  } else if (vis.imageUrl?.trim()) {
    drawPlaceholder(doc, x, y, areaW, boxH, `${hint}\n(Image URL set but could not be loaded.)`);
    usedH = boxH;
  } else {
    drawPlaceholder(doc, x, y, areaW, boxH, hint);
    usedH = boxH;
  }

  if (vis.imageAlt?.trim()) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    const altLines = doc.splitTextToSize(`Alt: ${vis.imageAlt.trim()}`, areaW);
    let ay = y + usedH + 3;
    for (const ln of altLines) {
      doc.text(ln, x, ay);
      ay += 9;
    }
    usedH = ay - y;
    doc.setTextColor(0);
  }

  return usedH;
}

function renderSingleMediaBlock(
  doc: jsPDF,
  vis: ProposalVisualBlock,
  x0: number,
  innerW: number,
  y: number,
  widthFactor: number,
  assets: Map<string, LogoImage>,
  ctx: ProposalLayoutCtx,
): number {
  let yy = ensureVisualSpace(doc, y, 130, ctx);
  const areaW = innerW * widthFactor;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(vis.title, x0, yy);
  yy += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const boxH = 118;
  const h = renderMediaArea(doc, vis, x0, yy, areaW, boxH, assets);
  yy += h + 6;
  if (vis.caption?.trim()) {
    yy = addParagraph(doc, vis.caption.trim(), x0, yy, areaW, LINE - 2, ctx);
  }
  return yy + 12;
}

function renderHalfPair(
  doc: jsPDF,
  left: ProposalVisualBlock,
  right: ProposalVisualBlock,
  y: number,
  assets: Map<string, LogoImage>,
  ctx: ProposalLayoutCtx,
): number {
  let yy = ensureVisualSpace(doc, y, 150, ctx);
  const innerW = PAGE_W - 2 * MARGIN;
  const gap = 14;
  const colW = (innerW - gap) / 2;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(left.title, MARGIN, yy);
  doc.text(right.title, MARGIN + colW + gap, yy);
  yy += 14;
  doc.setFont("helvetica", "normal");
  const boxH = 100;
  const hL = renderMediaArea(doc, left, MARGIN, yy, colW, boxH, assets);
  const hR = renderMediaArea(doc, right, MARGIN + colW + gap, yy, colW, boxH, assets);
  yy += Math.max(hL, hR) + 8;

  const yCap = yy;
  let yLeftEnd = yCap;
  let yRightEnd = yCap;
  if (left.caption?.trim()) {
    yLeftEnd = addParagraph(doc, left.caption.trim(), MARGIN, yCap, colW - 4, 11, ctx);
  }
  if (right.caption?.trim()) {
    yRightEnd = addParagraph(doc, right.caption.trim(), MARGIN + colW + gap, yCap, colW - 4, 11, ctx);
  }
  return Math.max(yLeftEnd, yRightEnd) + 12;
}

function renderTimelineStrip(
  doc: jsPDF,
  title: string,
  caption: string | null,
  steps: TimelineStep[],
  yStart: number,
  ctx: ProposalLayoutCtx,
): number {
  let y = ensureVisualSpace(doc, yStart, 120, ctx);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(title, MARGIN, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const innerW = PAGE_W - 2 * MARGIN;
  const useSteps = steps.length ? steps : TIMELINE_FALLBACK;
  const n = useSteps.length;
  const gap = 10;
  const boxW = (innerW - gap * (n - 1)) / n;
  const boxH = 56;
  const yBoxes = y;

  for (let i = 0; i < n; i++) {
    const x = MARGIN + i * (boxW + gap);
    doc.setDrawColor(...NEUTRAL.border);
    doc.setFillColor(...NEUTRAL.stripe);
    doc.roundedRect(x, yBoxes, boxW, boxH, 4, 4, "FD");
    doc.setTextColor(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const step = useSteps[i]!;
    const titleLines = doc.splitTextToSize(step.title, boxW - 16);
    let ty = yBoxes + 14;
    for (const tl of titleLines) {
      doc.text(tl, x + 8, ty);
      ty += 10;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80);
    if (step.detail) {
      const dLines = doc.splitTextToSize(step.detail, boxW - 16);
      for (const dl of dLines) {
        doc.text(dl, x + 8, ty);
        ty += 9;
      }
    }
    doc.setTextColor(0);
    if (i < n - 1) {
      doc.setFontSize(11);
      doc.setTextColor(140);
      doc.text("\u2192", x + boxW + gap / 2 - 5, yBoxes + boxH / 2 + 4);
      doc.setTextColor(0);
    }
  }

  y = yBoxes + boxH + 10;
  if (caption?.trim()) {
    y = addParagraph(doc, caption.trim(), MARGIN, y, innerW, LINE - 2, ctx);
  }
  return y + 12;
}

function renderProposalVisuals(
  doc: jsPDF,
  visuals: ProposalVisualBlock[],
  yStart: number,
  assets: Map<string, LogoImage>,
  ctx: ProposalLayoutCtx,
): number {
  const sorted = [...visuals].sort((a, b) => a.sortOrder - b.sortOrder);
  const innerW = PAGE_W - 2 * MARGIN;
  let y = yStart;
  let idx = 0;

  while (idx < sorted.length) {
    const vis = sorted[idx]!;
    if (vis.kind === "timeline") {
      const steps = parseTimelineSteps(vis.timelineSteps);
      y = renderTimelineStrip(doc, vis.title, vis.caption, steps, y, ctx);
      idx += 1;
      continue;
    }

    const next = sorted[idx + 1];
    if (
      vis.layout === "half_width" &&
      next &&
      next.kind === "media" &&
      next.layout === "half_width"
    ) {
      y = renderHalfPair(doc, vis, next, y, assets, ctx);
      idx += 2;
      continue;
    }

    if (vis.layout === "half_width") {
      y = renderSingleMediaBlock(doc, vis, MARGIN, innerW, y, 0.52, assets, ctx);
      idx += 1;
      continue;
    }

    y = renderSingleMediaBlock(doc, vis, MARGIN, innerW, y, 1, assets, ctx);
    idx += 1;
  }

  return y;
}

type TableCell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };

function buildPricingTableBody(proposal: ProposalForPdf, currency: string): TableCell[][] {
  const sorted = [...proposal.lineItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const pre = sorted.slice(0, Math.min(2, sorted.length));
  const post = sorted.slice(pre.length);

  const body: TableCell[][] = [];

  for (const row of pre) {
    body.push([row.description.trim(), formatQty(row.quantity), money(lineTotal(row), currency)]);
  }

  if (proposal.includedFeatures?.trim()) {
    const feats = proposal.includedFeatures
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const featText =
      `${PROPOSAL_TEMPLATE.applicationFeatureSetHeading}\n` + feats.map((f) => `\u2022 ${f}`).join("\n");
    body.push([
      {
        content: featText,
        colSpan: 3,
        styles: { halign: "left", valign: "top", fontStyle: "normal" },
      },
    ]);
  }

  if (post.length > 0) {
    body.push([
      {
        content: PROPOSAL_TEMPLATE.installationSectionTitle,
        colSpan: 3,
        styles: { halign: "left", valign: "top", fontStyle: "bold" },
      },
    ]);
    body.push([
      {
        content: PROPOSAL_TEMPLATE.installationSectionSubtitle,
        colSpan: 3,
        styles: { halign: "left", valign: "top", fontStyle: "normal" },
      },
    ]);
    for (const row of post) {
      body.push([row.description.trim(), formatQty(row.quantity), money(lineTotal(row), currency)]);
    }
  }

  if (body.length === 0) {
    body.push(["—", "", ""]);
  }

  return body;
}

export function buildProposalPdfBuffer(
  proposal: ProposalForPdf,
  assets: {
    headerLogo: LogoImage | null;
    centerBrandLogo: LogoImage | null;
    visualImages: Map<string, LogoImage>;
  },
): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const currency = proposal.currencyCode?.trim() || "XCD";

  const ctx: ProposalLayoutCtx = {
    pageNum: 1,
    continuedContentY: MARGIN + 40,
  };

  let y = drawProposalCoverPage(doc, proposal, {
    headerLogo: assets.headerLogo,
    centerBrandLogo: assets.centerBrandLogo,
  });

  if (proposal.executiveSummary?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text(PROPOSAL_TEMPLATE.overviewHeading, MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    y = addParagraph(doc, proposal.executiveSummary.trim(), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1, ctx);
    y += 10;
  }

  if (y > CONTENT_BOTTOM - 160) {
    y = newPage(doc, ctx);
  }

  const innerW = PAGE_W - 2 * MARGIN;
  const colWQty = Math.round(innerW * 0.12);
  const colWPrice = Math.round(innerW * 0.22);
  const colWDetail = innerW - colWQty - colWPrice;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(PROPOSAL_TEMPLATE.solutionPricingHeading, MARGIN, y);
  y += LINE + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y = addParagraph(doc, pricingIntroLine(currency), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1, ctx);
  y += 8;

  const tableBody = buildPricingTableBody(proposal, currency);

  autoTable(doc, {
    startY: y,
    head: [[PROPOSAL_TEMPLATE.tableHeadCol1, PROPOSAL_TEMPLATE.tableHeadCol2, tableHeadCol3(currency)]],
    body: tableBody,
    margin: { top: MARGIN + 36, left: MARGIN, right: MARGIN, bottom: MARGIN },
    tableWidth: innerW,
    showHead: "everyPage",
    theme: "plain",
    willDrawPage: (data) => {
      if (data.pageNumber > 1 && data.cursor) {
        drawContinuedLetterhead(data.doc);
        data.cursor.y = MARGIN + 40;
      }
    },
    styles: {
      fontSize: 9,
      cellPadding: { top: 7, right: 8, bottom: 7, left: 8 },
      valign: "top",
      lineColor: NEUTRAL.border,
      lineWidth: 0.25,
      textColor: [24, 24, 27],
    },
    headStyles: {
      fillColor: NEUTRAL.headBg,
      textColor: [24, 24, 27],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      lineColor: NEUTRAL.border,
      lineWidth: 0.35,
    },
    alternateRowStyles: { fillColor: NEUTRAL.stripe },
    columnStyles: {
      0: { cellWidth: colWDetail, halign: "left" },
      1: { cellWidth: colWQty, halign: "center" },
      2: { cellWidth: colWPrice, halign: "center" },
    },
  });

  y = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 10;

  if (proposal.pricingFootnote?.trim()) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(70);
    y = addParagraph(doc, proposal.pricingFootnote.trim(), MARGIN, y, PAGE_W - MARGIN * 2, 11, ctx);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    y += 8;
  }

  y = renderProposalVisuals(doc, proposal.visuals, y, assets.visualImages, ctx);

  if (proposal.assumptionsText?.trim()) {
    if (y > CONTENT_BOTTOM - 60) {
      y = newPage(doc, ctx);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(PROPOSAL_TEMPLATE.assumptionsHeading, MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    y = addParagraph(doc, proposal.assumptionsText.trim(), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1, ctx);
    y += 8;
  }

  if (proposal.nextStepsText?.trim()) {
    if (y > CONTENT_BOTTOM - 60) {
      y = newPage(doc, ctx);
    }
    doc.setFont("helvetica", "bold");
    doc.text(PROPOSAL_TEMPLATE.nextStepsHeading, MARGIN, y);
    y += LINE;
    doc.setFont("helvetica", "normal");
    y = addParagraph(doc, proposal.nextStepsText.trim(), MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1, ctx);
    y += 8;
  }

  if (proposal.termsText?.trim()) {
    if (y > CONTENT_BOTTOM - 48) {
      y = newPage(doc, ctx);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(PROPOSAL_TEMPLATE.termsMainHeading, MARGIN, y);
    y += LINE + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const blocks = parseTermsBlocks(proposal.termsText);
    for (const block of blocks) {
      if (y > CONTENT_BOTTOM - 36) {
        y = newPage(doc, ctx);
      }
      if (block.heading) {
        doc.setFont("helvetica", "bold");
        doc.text(block.heading, MARGIN, y);
        y += LINE;
      }
      doc.setFont("helvetica", "normal");
      if (block.body) {
        y = addParagraph(doc, block.body, MARGIN, y, PAGE_W - MARGIN * 2, LINE - 1, ctx);
      }
      y += 6;
    }
  }

  const validDays = proposal.validityDays > 0 ? proposal.validityDays : 14;
  if (y > CONTENT_BOTTOM - 72) {
    y = newPage(doc, ctx);
  }
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(PROPOSAL_TEMPLATE.validityHeading, MARGIN, y);
  y += LINE;
  doc.setFont("helvetica", "normal");
  y = addParagraph(
    doc,
    formatValidityBody(validDays),
    MARGIN,
    y,
    PAGE_W - MARGIN * 2,
    LINE - 1,
    ctx,
  );
  y += 4;

  if (
    proposal.salesContactName?.trim() ||
    proposal.salesContactEmail?.trim() ||
    proposal.salesContactPhone?.trim() ||
    proposal.salesContactTitle?.trim()
  ) {
    if (y > CONTENT_BOTTOM - 56) {
      y = newPage(doc, ctx);
    }
    doc.setFont("helvetica", "bold");
    doc.text(PROPOSAL_TEMPLATE.designatedContactHeading, MARGIN, y);
    y += LINE + 4;
    doc.setFont("helvetica", "normal");
    const labelX = MARGIN;
    const dashX = MARGIN + 130;
    const valX = MARGIN + 150;
    const rows: { label: string; value: string }[] = [
      { label: "Contact Person", value: proposal.salesContactName?.trim() ?? "" },
      { label: "Designation", value: proposal.salesContactTitle?.trim() ?? "" },
      { label: "Telephone", value: proposal.salesContactPhone?.trim() ?? "" },
      { label: "Email", value: proposal.salesContactEmail?.trim() ?? "" },
    ];
    for (const row of rows) {
      doc.text(row.label, labelX, y);
      doc.text("-", dashX, y);
      doc.text(row.value, valX, y);
      y += LINE - 2;
    }
  }

  addPageFooters(doc);

  const out = doc.output("arraybuffer");
  return Buffer.from(out);
}
