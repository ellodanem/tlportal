"use server";

import type {
  ProposalLineCategory,
  ProposalStatus,
  ProposalVisualKind,
  ProposalVisualLayout,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import { buildDefaultProposalNestedCreate } from "@/lib/proposals/default-draft";

export type SaveProposalState = { error?: string; ok?: boolean };

const LINE_CATEGORIES: ProposalLineCategory[] = [
  "hardware",
  "subscription",
  "installation",
  "service",
  "other",
];

function parseCategory(raw: string): ProposalLineCategory {
  const s = raw.trim().toLowerCase();
  return (LINE_CATEGORIES as readonly string[]).includes(s) ? (s as ProposalLineCategory) : "other";
}

function parseLineItemsJson(raw: string): Array<{
  category: ProposalLineCategory;
  description: string;
  quantity: number;
  unitLabel: string | null;
  unitPrice: number;
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Line items must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Line items must be an array.");
  }
  return parsed.map((row, i) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Line item ${i + 1} is invalid.`);
    }
    const r = row as Record<string, unknown>;
    const description = String(r.description ?? "").trim();
    if (!description) {
      throw new Error(`Line item ${i + 1} needs a description.`);
    }
    const qty = Number(r.quantity ?? 1);
    const price = Number(r.unitPrice ?? 0);
    if (!Number.isFinite(qty) || qty < 0) {
      throw new Error(`Line item ${i + 1} has an invalid quantity.`);
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Line item ${i + 1} has an invalid unit price.`);
    }
    const unitLabelRaw = String(r.unitLabel ?? "").trim();
    return {
      category: parseCategory(String(r.category ?? "other")),
      description,
      quantity: qty,
      unitLabel: unitLabelRaw.length ? unitLabelRaw : null,
      unitPrice: price,
    };
  });
}

function parseVisualKind(raw: unknown): ProposalVisualKind {
  const s = String(raw ?? "media").toLowerCase();
  return s === "timeline" ? "timeline" : "media";
}

function parseVisualLayout(raw: unknown): ProposalVisualLayout {
  const s = String(raw ?? "full_width").toLowerCase();
  if (s === "half_width" || s === "half") return "half_width";
  return "full_width";
}

function parseVisualsJson(raw: string): Array<{
  title: string;
  caption: string | null;
  imageUrl: string | null;
  placeholderHint: string | null;
  imageAlt: string | null;
  kind: ProposalVisualKind;
  layout: ProposalVisualLayout;
  timelineSteps: { title: string; detail: string }[];
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Visual blocks must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Visual blocks must be an array.");
  }
  return parsed.map((row, i) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Visual ${i + 1} is invalid.`);
    }
    const r = row as Record<string, unknown>;
    const title = String(r.title ?? "").trim();
    if (!title) {
      throw new Error(`Visual ${i + 1} needs a title.`);
    }
    const caption = String(r.caption ?? "").trim();
    const imageUrl = String(r.imageUrl ?? "").trim();
    const placeholderHint = String(r.placeholderHint ?? "").trim();
    const imageAlt = String(r.imageAlt ?? "").trim();
    const kind = parseVisualKind(r.kind);
    let layout = parseVisualLayout(r.layout);
    if (kind === "timeline") {
      layout = "full_width";
    }

    let timelineSteps: { title: string; detail: string }[] = [];
    if (r.timelineSteps != null) {
      if (!Array.isArray(r.timelineSteps)) {
        throw new Error(`Visual ${i + 1}: timeline steps must be an array.`);
      }
      timelineSteps = r.timelineSteps
        .map((step, j) => {
          if (!step || typeof step !== "object") {
            throw new Error(`Visual ${i + 1} step ${j + 1} is invalid.`);
          }
          const st = step as Record<string, unknown>;
          const stTitle = String(st.title ?? "").trim();
          const detail = String(st.detail ?? "").trim();
          return { title: stTitle, detail };
        })
        .filter((s) => s.title.length > 0)
        .slice(0, 8);
    }
    if (kind === "timeline" && timelineSteps.length === 0) {
      throw new Error(`Visual ${i + 1}: timeline blocks need at least one step with a title.`);
    }

    return {
      title,
      caption: caption.length ? caption : null,
      imageUrl: imageUrl.length ? imageUrl : null,
      placeholderHint: placeholderHint.length ? placeholderHint : null,
      imageAlt: imageAlt.length ? imageAlt : null,
      kind,
      layout,
      timelineSteps,
    };
  });
}

function readOptionalText(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v.length ? v : null;
}

function readText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createProposal(): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const proposal = await prisma.proposal.create({
    data: buildDefaultProposalNestedCreate(session.sub),
  });

  redirect(`/admin/proposals/${proposal.id}`);
}

export async function saveProposal(formData: FormData): Promise<SaveProposalState> {
  const session = await getSession();
  if (!session) {
    return { error: "You must be signed in." };
  }

  const id = readText(formData, "proposalId");
  if (!id) {
    return { error: "Missing proposal id." };
  }

  const title = readText(formData, "title");
  if (!title) {
    return { error: "Title is required." };
  }

  const customerIdRaw = readText(formData, "customerId");
  const customerId = customerIdRaw.length ? customerIdRaw : null;

  const validityDays = Math.min(365, Math.max(1, parseInt(readText(formData, "validityDays") || "14", 10) || 14));

  const statusRaw = readText(formData, "status");
  const status: ProposalStatus = statusRaw === "sent" ? "sent" : "draft";

  const currencyCode = (readText(formData, "currencyCode") || "XCD").slice(0, 8).toUpperCase() || "XCD";

  let lineItems;
  let visuals;
  try {
    lineItems = parseLineItemsJson(readText(formData, "lineItemsJson"));
    visuals = parseVisualsJson(readText(formData, "visualsJson"));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid form data.";
    return { error: message };
  }

  const existing = await prisma.proposal.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return { error: "Proposal not found." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.proposal.update({
        where: { id },
        data: {
          title,
          status,
          customerId,
          clientLabel: readOptionalText(formData, "clientLabel"),
          clientCompany: readOptionalText(formData, "clientCompany"),
          clientContactName: readOptionalText(formData, "clientContactName"),
          clientEmail: readOptionalText(formData, "clientEmail"),
          clientPhone: readOptionalText(formData, "clientPhone"),
          clientAddress: readOptionalText(formData, "clientAddress"),
          executiveSummary: readOptionalText(formData, "executiveSummary"),
          includedFeatures: readOptionalText(formData, "includedFeatures"),
          assumptionsText: readOptionalText(formData, "assumptionsText"),
          nextStepsText: readOptionalText(formData, "nextStepsText"),
          termsText: readOptionalText(formData, "termsText"),
          pricingFootnote: readOptionalText(formData, "pricingFootnote"),
          currencyCode,
          validityDays,
          salesContactName: readOptionalText(formData, "salesContactName"),
          salesContactTitle: readOptionalText(formData, "salesContactTitle"),
          salesContactEmail: readOptionalText(formData, "salesContactEmail"),
          salesContactPhone: readOptionalText(formData, "salesContactPhone"),
        },
      });

      await tx.proposalLineItem.deleteMany({ where: { proposalId: id } });
      if (lineItems.length) {
        await tx.proposalLineItem.createMany({
          data: lineItems.map((row, sortOrder) => ({
            proposalId: id,
            sortOrder,
            category: row.category,
            description: row.description,
            quantity: row.quantity,
            unitLabel: row.unitLabel,
            unitPrice: row.unitPrice,
          })),
        });
      }

      await tx.proposalVisualBlock.deleteMany({ where: { proposalId: id } });
      if (visuals.length) {
        await tx.proposalVisualBlock.createMany({
          data: visuals.map((row, sortOrder) => ({
            proposalId: id,
            sortOrder,
            title: row.title,
            caption: row.caption,
            imageUrl: row.imageUrl,
            placeholderHint: row.placeholderHint,
            imageAlt: row.imageAlt,
            kind: row.kind,
            layout: row.layout,
            timelineSteps:
              row.kind === "timeline" && row.timelineSteps.length > 0
                ? (row.timelineSteps as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
          })),
        });
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save proposal.";
    return { error: message };
  }

  revalidatePath("/admin/proposals");
  revalidatePath(`/admin/proposals/${id}`);
  return { ok: true };
}

export async function deleteProposal(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const id = readText(formData, "proposalId");
  if (!id) {
    redirect("/admin/proposals");
  }

  await prisma.proposal.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/proposals");
  redirect("/admin/proposals");
}
