import "server-only";

import type { ProposalLineItem, ProposalVisualBlock } from "@prisma/client";
import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TabStopType,
  VerticalAlignTable,
  WidthType,
  type FileChild,
} from "docx";

import type { LogoImage, ProposalForPdf } from "@/lib/proposals/pdf";
import {
  formatValidityBody,
  pricingIntroLine,
  PROPOSAL_TEMPLATE,
} from "@/lib/proposals/proposal-template";
import { parseTimelineSteps, type TimelineStep } from "@/lib/proposals/visual-timeline";

const NEUTRAL = {
  muted: "52525B",
  headBg: "F5F5F5",
  rowStripe: "FCFCFC",
  border: "C8C8C8",
  text: "18181B",
};

const PAGE_CONTENT_TWIPS = Math.round(6.5 * 72 * 20);

const TIMELINE_FALLBACK: TimelineStep[] = [
  { title: "Order", detail: "1–3 business days" },
  { title: "Install", detail: "20–45 min / vehicle" },
  { title: "Go live", detail: "Same day when online" },
];

function formatQty(q: unknown): string {
  const n = Number(q);
  return String(Number.isFinite(n) ? n : 0);
}

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

function proposalSubjectLine(proposal: ProposalForPdf): string {
  const t = proposal.title.trim();
  return t || PROPOSAL_TEMPLATE.defaultSubject;
}

/** Same rule as PDF: blocks separated by a line containing only `---`. */
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

function pngPixelSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function scaleToMaxBox(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const s = Math.min(maxW / w, maxH / h, 1);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function imageBufferAndDims(logo: LogoImage): { buf: Buffer; type: "png" | "jpg"; w: number; h: number } | null {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/i.exec(logo.dataUrl);
  if (!m) return null;
  const isPng = m[1]!.toLowerCase() === "png";
  const buf = Buffer.from(m[2]!, "base64");
  const px = isPng ? pngPixelSize(buf) : null;
  const w = px?.w ?? 640;
  const h = px?.h ?? 360;
  return { buf, type: isPng ? "png" : "jpg", w, h };
}

function softCellBorders() {
  const edge = { style: BorderStyle.SINGLE, size: 1, color: NEUTRAL.border } as const;
  return { top: edge, bottom: edge, left: edge, right: edge };
}

function parasFromPlainText(text: string, runOpts: { size?: number; color?: string; italics?: boolean } = {}): Paragraph[] {
  const lines = text.split(/\r?\n/);
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: line,
            size: runOpts.size ?? 20,
            color: runOpts.color,
            italics: runOpts.italics,
          }),
        ],
      }),
  );
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: NEUTRAL.text })],
  });
}

function logoParagraph(logo: LogoImage | null): Paragraph | null {
  if (!logo) return null;
  const img = imageBufferAndDims(logo);
  if (!img) return null;
  const dim = scaleToMaxBox(img.w, img.h, 360, 100);
  return new Paragraph({
    spacing: { after: 160 },
    children: [
      new ImageRun({
        type: img.type,
        data: img.buf,
        transformation: { width: dim.w, height: dim.h },
      }),
    ],
  });
}

function letterheadBlock(): Paragraph[] {
  return [
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: PROPOSAL_TEMPLATE.headerLine1, bold: true, size: 20, color: NEUTRAL.text })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: PROPOSAL_TEMPLATE.headerLine2, size: 18, color: NEUTRAL.muted })],
    }),
  ];
}

function mediaBlocksForVisual(
  vis: ProposalVisualBlock,
  assets: Map<string, LogoImage>,
  maxW: number,
  maxH: number,
): Paragraph[] {
  const hint = vis.placeholderHint?.trim() || "[Image placeholder]";
  const logo = assets.get(vis.id);
  if (logo) {
    const img = imageBufferAndDims(logo);
    if (img) {
      const dim = scaleToMaxBox(img.w, img.h, maxW, maxH);
      const alt = vis.imageAlt?.trim();
      return [
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new ImageRun({
              type: img.type,
              data: img.buf,
              transformation: { width: dim.w, height: dim.h },
              altText: alt ? { name: alt.slice(0, 120) } : undefined,
            }),
          ],
        }),
      ];
    }
  }
  const msg =
    vis.imageUrl?.trim() && !logo
      ? `${hint}\n(Image URL set but could not be loaded.)`
      : hint;
  return parasFromPlainText(msg, { size: 18, italics: true, color: "71717A" });
}

function captionParas(caption: string | null | undefined): Paragraph[] {
  if (!caption?.trim()) return [];
  return parasFromPlainText(caption.trim(), { size: 18 });
}

function timelineSection(title: string, caption: string | null, steps: TimelineStep[]): FileChild[] {
  const useSteps = steps.length ? steps : TIMELINE_FALLBACK;
  const n = useSteps.length;
  const colW = Math.floor(PAGE_CONTENT_TWIPS / n);
  const cells = useSteps.map(
    (s) =>
      new TableCell({
        shading: { fill: "FCFCFC" },
        borders: softCellBorders(),
        margins: { top: convertInchesToTwip(0.08), bottom: convertInchesToTwip(0.08), left: 80, right: 80 },
        verticalAlign: VerticalAlignTable.TOP,
        children: [
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: s.title, bold: true, size: 18, color: "18181B" })],
          }),
          ...(s.detail?.trim()
            ? [
                new Paragraph({
                  children: [new TextRun({ text: s.detail.trim(), size: 16, color: NEUTRAL.muted })],
                }),
              ]
            : []),
        ],
      }),
  );

  const out: FileChild[] = [
    sectionHeading(title),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      columnWidths: Array(n).fill(colW),
      rows: [new TableRow({ children: cells })],
    }),
  ];

  if (caption?.trim()) {
    const lines = caption.trim().split(/\r?\n/);
    lines.forEach((line, i) => {
      out.push(
        new Paragraph({
          spacing: { before: i === 0 ? 120 : 60, after: 60 },
          children: [new TextRun({ text: line, size: 18 })],
        }),
      );
    });
  }

  return out;
}

function buildPricingTableDocx(proposal: ProposalForPdf, currency: string): Table {
  const sorted = [...proposal.lineItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const pre = sorted.slice(0, Math.min(2, sorted.length));
  const post = sorted.slice(pre.length);

  const detailW = Math.round(PAGE_CONTENT_TWIPS * 0.58);
  const qtyW = Math.round(PAGE_CONTENT_TWIPS * 0.12);
  const priceW = PAGE_CONTENT_TWIPS - detailW - qtyW;

  const head = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        shading: { fill: NEUTRAL.headBg },
        borders: softCellBorders(),
        width: { size: detailW, type: WidthType.DXA },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: PROPOSAL_TEMPLATE.tableHeadCol1, bold: true, size: 18, color: NEUTRAL.text }),
            ],
          }),
        ],
      }),
      new TableCell({
        shading: { fill: NEUTRAL.headBg },
        borders: softCellBorders(),
        width: { size: qtyW, type: WidthType.DXA },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: PROPOSAL_TEMPLATE.tableHeadCol2, bold: true, size: 18, color: NEUTRAL.text }),
            ],
          }),
        ],
      }),
      new TableCell({
        shading: { fill: NEUTRAL.headBg },
        borders: softCellBorders(),
        width: { size: priceW, type: WidthType.DXA },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Price", bold: true, size: 18, color: NEUTRAL.text })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `(${currency}) Total`, bold: true, size: 18, color: NEUTRAL.text })],
          }),
        ],
      }),
    ],
  });

  const bodyRows: TableRow[] = [];
  let stripe = 0;
  const nextFill = () => (stripe++ % 2 === 1 ? NEUTRAL.rowStripe : "FFFFFF");

  for (const row of pre) {
    const fill = nextFill();
    bodyRows.push(
      new TableRow({
        children: [
          new TableCell({
            shading: { fill },
            borders: softCellBorders(),
            verticalAlign: VerticalAlignTable.TOP,
            children: parasFromPlainText(row.description.trim(), { size: 18 }),
          }),
          new TableCell({
            shading: { fill },
            borders: softCellBorders(),
            verticalAlign: VerticalAlignTable.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: formatQty(row.quantity), size: 18 })],
              }),
            ],
          }),
          new TableCell({
            shading: { fill },
            borders: softCellBorders(),
            verticalAlign: VerticalAlignTable.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: money(lineTotal(row), currency), size: 18 })],
              }),
            ],
          }),
        ],
      }),
    );
  }

  if (proposal.includedFeatures?.trim()) {
    const feats = proposal.includedFeatures
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const featText =
      `${PROPOSAL_TEMPLATE.applicationFeatureSetHeading}\n` + feats.map((f) => `\u2022 ${f}`).join("\n");
    const fill = nextFill();
    bodyRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 3,
            shading: { fill },
            borders: softCellBorders(),
            verticalAlign: VerticalAlignTable.TOP,
            children: parasFromPlainText(featText, { size: 18 }),
          }),
        ],
      }),
    );
  }

  if (post.length > 0) {
    const fillTitle = nextFill();
    bodyRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 3,
            shading: { fill: fillTitle },
            borders: softCellBorders(),
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: PROPOSAL_TEMPLATE.installationSectionTitle, bold: true, size: 18 }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
    const fillSub = nextFill();
    bodyRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 3,
            shading: { fill: fillSub },
            borders: softCellBorders(),
            children: [
              new Paragraph({
                children: [new TextRun({ text: PROPOSAL_TEMPLATE.installationSectionSubtitle, size: 18 })],
              }),
            ],
          }),
        ],
      }),
    );
    for (const row of post) {
      const fill = nextFill();
      bodyRows.push(
        new TableRow({
          children: [
            new TableCell({
              shading: { fill },
              borders: softCellBorders(),
              verticalAlign: VerticalAlignTable.TOP,
              children: parasFromPlainText(row.description.trim(), { size: 18 }),
            }),
            new TableCell({
              shading: { fill },
              borders: softCellBorders(),
              verticalAlign: VerticalAlignTable.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: formatQty(row.quantity), size: 18 })],
                }),
              ],
            }),
            new TableCell({
              shading: { fill },
              borders: softCellBorders(),
              verticalAlign: VerticalAlignTable.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: money(lineTotal(row), currency), size: 18 })],
                }),
              ],
            }),
          ],
        }),
      );
    }
  }

  if (bodyRows.length === 0) {
    bodyRows.push(
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: "FFFFFF" },
            borders: softCellBorders(),
            children: [new Paragraph({ children: [new TextRun({ text: "\u2014", size: 18 })] })],
          }),
          new TableCell({ shading: { fill: "FFFFFF" }, borders: softCellBorders(), children: [new Paragraph({})] }),
          new TableCell({ shading: { fill: "FFFFFF" }, borders: softCellBorders(), children: [new Paragraph({})] }),
        ],
      }),
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: [detailW, qtyW, priceW],
    rows: [head, ...bodyRows],
  });
}

function singleMediaSection(vis: ProposalVisualBlock, assets: Map<string, LogoImage>, innerMaxW: number): FileChild[] {
  const out: FileChild[] = [
    new Paragraph({
      spacing: { before: 200, after: 120 },
      children: [new TextRun({ text: vis.title, bold: true, size: 22, color: NEUTRAL.text })],
    }),
    ...mediaBlocksForVisual(vis, assets, innerMaxW, 200),
  ];
  for (const p of captionParas(vis.caption)) {
    out.push(p);
  }
  return out;
}

function halfPairSection(left: ProposalVisualBlock, right: ProposalVisualBlock, assets: Map<string, LogoImage>): FileChild[] {
  const half = Math.floor(PAGE_CONTENT_TWIPS / 2);
  const cell = (vis: ProposalVisualBlock) =>
    new TableCell({
      borders: softCellBorders(),
      margins: { top: 80, bottom: 80, left: 60, right: 60 },
      verticalAlign: VerticalAlignTable.TOP,
      children: [
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: vis.title, bold: true, size: 20, color: NEUTRAL.text })],
        }),
        ...mediaBlocksForVisual(vis, assets, 380, 160),
        ...captionParas(vis.caption),
      ],
    });

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      columnWidths: [half, half],
      rows: [new TableRow({ children: [cell(left), cell(right)] })],
    }),
  ];
}

function appendVisuals(blocks: FileChild[], visuals: ProposalVisualBlock[], assets: Map<string, LogoImage>) {
  const sorted = [...visuals].sort((a, b) => a.sortOrder - b.sortOrder);
  let idx = 0;
  while (idx < sorted.length) {
    const vis = sorted[idx]!;
    if (vis.kind === "timeline") {
      const steps = parseTimelineSteps(vis.timelineSteps);
      blocks.push(...timelineSection(vis.title, vis.caption, steps));
      idx += 1;
      continue;
    }
    const next = sorted[idx + 1];
    if (vis.layout === "half_width" && next?.kind === "media" && next.layout === "half_width") {
      blocks.push(...halfPairSection(vis, next, assets));
      idx += 2;
      continue;
    }
    const innerMaxW = vis.layout === "half_width" ? 280 : 520;
    blocks.push(...singleMediaSection(vis, assets, innerMaxW));
    idx += 1;
  }
}

const defaultFooter = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "-- ", size: 16, color: "828282" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "828282" }),
        new TextRun({ text: " of ", size: 16, color: "828282" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "828282" }),
        new TextRun({ text: " --", size: 16, color: "828282" }),
      ],
    }),
  ],
});

export async function buildProposalDocxBuffer(
  proposal: ProposalForPdf,
  assets: { logo: LogoImage | null; visualImages: Map<string, LogoImage> },
): Promise<Buffer> {
  const currency = proposal.currencyCode?.trim() || "XCD";
  const subject = proposalSubjectLine(proposal);

  const children: FileChild[] = [];

  children.push(...letterheadBlock());
  const lp = logoParagraph(assets.logo);
  if (lp) children.push(lp);

  children.push(
    new Paragraph({
      spacing: { before: 120, after: 60 },
      children: [new TextRun({ text: PROPOSAL_TEMPLATE.proposalForLabel, size: 20, color: NEUTRAL.muted })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: subject, bold: true, size: 30, color: NEUTRAL.text })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: PROPOSAL_TEMPLATE.preparedForLabel, bold: true, size: 20 })],
    }),
  );

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
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: line, size: 20 })],
      }),
    );
  }

  if (proposal.executiveSummary?.trim()) {
    children.push(sectionHeading(PROPOSAL_TEMPLATE.overviewHeading));
    children.push(...parasFromPlainText(proposal.executiveSummary.trim(), { size: 20 }));
  }

  children.push(
    new Paragraph({
      spacing: { before: 200, after: 80 },
      children: [
        new TextRun({ text: PROPOSAL_TEMPLATE.solutionPricingHeading, bold: true, size: 24, color: NEUTRAL.text }),
      ],
    }),
    ...parasFromPlainText(pricingIntroLine(currency), { size: 20 }),
  );

  children.push(buildPricingTableDocx(proposal, currency));

  if (proposal.pricingFootnote?.trim()) {
    const fnLines = proposal.pricingFootnote.trim().split(/\r?\n/);
    fnLines.forEach((line, i) => {
      children.push(
        new Paragraph({
          spacing: { before: i === 0 ? 120 : 60, after: 60 },
          children: [new TextRun({ text: line, size: 16, italics: true, color: "464646" })],
        }),
      );
    });
  }

  appendVisuals(children, proposal.visuals, assets.visualImages);

  if (proposal.assumptionsText?.trim()) {
    children.push(sectionHeading(PROPOSAL_TEMPLATE.assumptionsHeading));
    children.push(...parasFromPlainText(proposal.assumptionsText.trim(), { size: 20 }));
  }

  if (proposal.nextStepsText?.trim()) {
    children.push(sectionHeading(PROPOSAL_TEMPLATE.nextStepsHeading));
    children.push(...parasFromPlainText(proposal.nextStepsText.trim(), { size: 20 }));
  }

  if (proposal.termsText?.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({ text: PROPOSAL_TEMPLATE.termsMainHeading, bold: true, size: 24, color: NEUTRAL.text }),
        ],
      }),
    );
    const blocks = parseTermsBlocks(proposal.termsText);
    for (const block of blocks) {
      if (block.heading) {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [new TextRun({ text: block.heading, bold: true, size: 20 })],
          }),
        );
      }
      if (block.body) {
        children.push(...parasFromPlainText(block.body, { size: 18 }));
      }
    }
  }

  const validDays = proposal.validityDays > 0 ? proposal.validityDays : 14;
  children.push(
    new Paragraph({
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: PROPOSAL_TEMPLATE.validityHeading, bold: true, size: 20 })],
    }),
    ...parasFromPlainText(formatValidityBody(validDays), { size: 18 }),
  );

  if (
    proposal.salesContactName?.trim() ||
    proposal.salesContactEmail?.trim() ||
    proposal.salesContactPhone?.trim() ||
    proposal.salesContactTitle?.trim()
  ) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: PROPOSAL_TEMPLATE.designatedContactHeading, bold: true, size: 20 })],
      }),
    );
    const rows: { label: string; value: string }[] = [
      { label: "Contact Person", value: proposal.salesContactName?.trim() ?? "" },
      { label: "Designation", value: proposal.salesContactTitle?.trim() ?? "" },
      { label: "Telephone", value: proposal.salesContactPhone?.trim() ?? "" },
      { label: "Email", value: proposal.salesContactEmail?.trim() ?? "" },
    ];
    for (const row of rows) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          tabStops: [
            { type: TabStopType.LEFT, position: 2800 },
            { type: TabStopType.LEFT, position: 3200 },
          ],
          children: [
            new TextRun({ text: row.label, size: 20 }),
            new TextRun({ text: "\t" }),
            new TextRun({ text: "-", size: 20 }),
            new TextRun({ text: "\t" }),
            new TextRun({ text: row.value, size: 20 }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        footers: { default: defaultFooter },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

