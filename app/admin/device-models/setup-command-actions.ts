"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

import {
  setupCommandInitialState,
  type SetupCommandActionState,
} from "./setup-command-form-state";

const NAME_MAX = 80;
const BODY_MAX = 2000;
const NOTE_MAX = 500;

function revalidateModel(modelId: string) {
  revalidatePath(`/admin/device-models/${modelId}/edit`);
  revalidatePath("/admin/devices");
}

function fail(error: string): SetupCommandActionState {
  return { error, okId: null };
}

async function requireUser(): Promise<SetupCommandActionState | null> {
  const session = await getSession();
  if (!session) {
    return fail("You must be signed in.");
  }
  return null;
}

function parseFields(formData: FormData): { name: string; body: string; note: string | null } | SetupCommandActionState {
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!name) {
    return fail("Name is required.");
  }
  if (!body) {
    return fail("Command is required.");
  }
  if (name.length > NAME_MAX) {
    return fail(`Name must be ${NAME_MAX} characters or fewer.`);
  }
  if (body.length > BODY_MAX) {
    return fail(`Command must be ${BODY_MAX} characters or fewer.`);
  }
  if (note.length > NOTE_MAX) {
    return fail(`Note must be ${NOTE_MAX} characters or fewer.`);
  }
  return { name, body, note: note.length ? note : null };
}

function isError(value: { name: string; body: string; note: string | null } | SetupCommandActionState): value is SetupCommandActionState {
  return "error" in value;
}

async function rewriteOrder(modelId: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.deviceModelSetupCommand.update({
        where: { id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );
}

export async function createSetupCommand(
  _prev: SetupCommandActionState,
  formData: FormData,
): Promise<SetupCommandActionState> {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }

  const deviceModelId = String(formData.get("deviceModelId") ?? "").trim();
  if (!deviceModelId) {
    return fail("Missing device model.");
  }

  const fields = parseFields(formData);
  if (isError(fields)) {
    return fields;
  }

  const model = await prisma.deviceModel.findUnique({
    where: { id: deviceModelId },
    select: { id: true },
  });
  if (!model) {
    return fail("Device model not found.");
  }

  const last = await prisma.deviceModelSetupCommand.findFirst({
    where: { deviceModelId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.deviceModelSetupCommand.create({
    data: {
      deviceModelId,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      name: fields.name,
      body: fields.body,
      note: fields.note,
    },
  });

  revalidateModel(deviceModelId);
  return { error: null, okId: Date.now() };
}

export async function updateSetupCommand(
  _prev: SetupCommandActionState,
  formData: FormData,
): Promise<SetupCommandActionState> {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return fail("Missing command.");
  }

  const fields = parseFields(formData);
  if (isError(fields)) {
    return fields;
  }

  const existing = await prisma.deviceModelSetupCommand.findUnique({
    where: { id },
    select: { deviceModelId: true },
  });
  if (!existing) {
    return fail("Command not found.");
  }

  await prisma.deviceModelSetupCommand.update({
    where: { id },
    data: {
      name: fields.name,
      body: fields.body,
      note: fields.note,
    },
  });

  revalidateModel(existing.deviceModelId);
  return setupCommandInitialState;
}

export async function deleteSetupCommand(
  _prev: SetupCommandActionState,
  formData: FormData,
): Promise<SetupCommandActionState> {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return fail("Missing command.");
  }

  const existing = await prisma.deviceModelSetupCommand.findUnique({
    where: { id },
    select: { deviceModelId: true },
  });
  if (!existing) {
    return fail("Command not found.");
  }

  await prisma.deviceModelSetupCommand.delete({ where: { id } });
  const remaining = await prisma.deviceModelSetupCommand.findMany({
    where: { deviceModelId: existing.deviceModelId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  await rewriteOrder(
    existing.deviceModelId,
    remaining.map((row) => row.id),
  );

  revalidateModel(existing.deviceModelId);
  return setupCommandInitialState;
}

export async function moveSetupCommand(
  _prev: SetupCommandActionState,
  formData: FormData,
): Promise<SetupCommandActionState> {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }

  const id = String(formData.get("id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) {
    return fail("Missing command.");
  }

  const existing = await prisma.deviceModelSetupCommand.findUnique({
    where: { id },
    select: { deviceModelId: true },
  });
  if (!existing) {
    return fail("Command not found.");
  }

  const rows = await prisma.deviceModelSetupCommand.findMany({
    where: { deviceModelId: existing.deviceModelId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = rows.findIndex((row) => row.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= rows.length) {
    return setupCommandInitialState;
  }

  const ordered = rows.map((row) => row.id);
  const current = ordered[index];
  const neighbor = ordered[swapIndex];
  if (!current || !neighbor) {
    return setupCommandInitialState;
  }
  ordered[index] = neighbor;
  ordered[swapIndex] = current;
  await rewriteOrder(existing.deviceModelId, ordered);

  revalidateModel(existing.deviceModelId);
  return setupCommandInitialState;
}
