import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("resuming a subscription service is guarded like pausing and never touches billing", async () => {
  const actions = await read("app/admin/subscriptions/canonical/actions.ts");
  const resume = functionBody(actions, "resumeCanonicalServiceAssignmentAction");
  const pause = functionBody(actions, "pauseCanonicalServiceAssignmentAction");

  for (const guard of ["requireManageableCanonicalItem(", "requireOpenCanonicalServiceAssignment("]) {
    assert.ok(pause.includes(guard) && resume.includes(guard), `both actions must call ${guard}`);
  }
  assert.ok(resume.includes("resumeServiceAssignment("));
  assert.ok(resume.includes('"subscription.service_resumed"'), "resume is recorded as an operational event");
  assert.match(resume, /\["ended", "canceled"\]\.includes\(item\.status\)/, "an ended service cannot be resumed");
  assert.doesNotMatch(resume, /stripe\.|getStripeClient|pushTlVehicleCountToStripe|recurringInvoiceSchedule|setRecurringScheduleStatus/);
});

test("subscription pages offer Resume instead of pointing at the device page, which rejects subscription services", async () => {
  const devices = await read("app/admin/devices/actions.ts");
  assert.match(devices, /Pause or resume canonical services from the authorized subscription workflow/);

  const modal = await read("components/admin/customer-service-management-modal.tsx");
  const details = await read("components/admin/canonical-subscription/service-details.tsx");
  for (const source of [modal, details]) {
    assert.match(source, /CanonicalServiceResumeForm/);
    assert.doesNotMatch(source, /Resume it from the device assignment/);
  }
});
