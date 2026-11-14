import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { activeSubscriptionTab, subscriptionServicePath, subscriptionTabs } from "../lib/domain/canonical-subscription-navigation";

const read = (path: string) => readFile(path, "utf8");

const DETAILS = "components/admin/canonical-subscription/service-details.tsx";
const PANELS = "components/admin/canonical-subscription/service-action-panels.tsx";
const DIALOG = "components/admin/canonical-subscription/service-action-dialog.tsx";
const HISTORY = "components/admin/canonical-subscription/service-history.tsx";
const ACTIONS = "app/admin/subscriptions/canonical/actions.ts";

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

// ---- Navigation is preserved -------------------------------------------------------------------

test("Services stays the active tab on the service screen and its history, and every tab is kept", () => {
  assert.deepEqual(
    subscriptionTabs("sub-1", { showAdvanced: true }).map((tab) => tab.label),
    ["Services", "Billing", "Activity", "Advanced"],
  );
  // The tabs read the first segment under the subscription layout, which is "services" for
  // /services, /services/:id and /services/:id/history alike.
  assert.equal(activeSubscriptionTab("services"), "services");
  assert.equal(subscriptionServicePath("sub-1", "item-1"), "/admin/subscriptions/canonical/sub-1/services/item-1");
});

test("the service screen and its history only show a service that belongs to the subscription", async () => {
  const [screen, history] = await Promise.all([
    read("app/admin/subscriptions/canonical/[subscriptionId]/(tabs)/services/[itemId]/page.tsx"),
    read("app/admin/subscriptions/canonical/[subscriptionId]/(tabs)/services/[itemId]/history/page.tsx"),
  ]);
  for (const source of [screen, history]) {
    assert.match(source, /requireSubscriptionPage\(subscriptionId\)/);
    assert.match(source, /subscription\.items\.(find|findIndex)\(/);
    assert.match(source, /notFound\(\)/);
  }
});

test("a subscription with several services can reach every one of them and the full list", async () => {
  const details = await read(DETAILS);
  assert.match(details, /aria-label="Services in this subscription"/);
  assert.match(details, /subscription\.items\.map\(/);
  assert.match(details, /aria-label="Back to all services"/);
  assert.match(details, /subscriptionServicePath\(subscription\.id, candidate\.id\)/);
});

// ---- Layout and presentation --------------------------------------------------------------------

test("the service screen is two-thirds details beside one-third actions, with history below both", async () => {
  const details = await read(DETAILS);
  assert.match(details, /grid gap-4 lg:grid-cols-3/);
  assert.match(details, /lg:col-span-2/);
  const detailsIndex = details.indexOf('aria-labelledby="service-details-heading"');
  const actionsIndex = details.indexOf('aria-labelledby="other-actions-heading"');
  const historyIndex = details.indexOf("<ServiceHistorySummary");
  assert.ok(detailsIndex > 0 && detailsIndex < actionsIndex && actionsIndex < historyIndex);
});

test("service details shows the specified fields and the three primary actions, with no inline operational forms", async () => {
  const [details, panels] = await Promise.all([read(DETAILS), read(PANELS)]);
  for (const label of ["Tracker", "SIM", "Service rate", "Assigned since", "Status"]) assert.match(details, new RegExp(`>${label}<|label="${label}"`));
  for (const label of ["Replace tracker", "Swap SIM", "Manage rate"]) assert.match(panels, new RegExp(label));
  assert.match(panels, /className=\{primaryButton\}><RefreshIcon className="size-4" \/>Replace tracker/, "Replace tracker is the primary action");
  // Forms live in dialogs the user opens; the page itself renders none of them.
  assert.doesNotMatch(details, /Canonical(VehicleSaleRemoval|AssetLoss|ServiceTransfer|ServiceHardwareReplacement)Form|ScheduleCanonicalDraftRateForm/);
  assert.doesNotMatch(details, /<form[\s>]/);
});

test("other service actions are three labelled rows that open focused dialogs, in neutral styling", async () => {
  const panels = await read(PANELS);
  for (const title of ["Transfer to another subscription", "Vehicle sold / remove tracker", "Asset lost / unrecoverable"]) assert.match(panels, new RegExp(title.replace("/", "\\/")));
  const row = panels.slice(panels.indexOf("function ActionRow("), panels.indexOf("// ---- Transfer"));
  assert.match(row, /aria-haspopup="dialog"/);
  assert.match(row, /disabled=\{!availability\.enabled\}/);
  assert.match(row, /availability\.reason/, "a disabled row explains itself");
  assert.doesNotMatch(row, /border-red|bg-red-[5-9]00|text-red-[89]00/, "row borders stay neutral; red is reserved for the confirmation");
  assert.doesNotMatch(row, /<form/);
});

test("red is reserved for the destructive confirmation", async () => {
  const panels = await read(PANELS);
  const lossStart = panels.indexOf("function AssetLostDialog(");
  const lossEnd = panels.indexOf("// ---- The \"Other service actions\" list");
  const outside = (panels.slice(0, lossStart) + panels.slice(lossEnd)).split("\n").filter((line) => /red-\d/.test(line));
  // Outside the asset-loss dialog, red appears only as the shared danger-button style, the danger
  // variant of the consequence list, and the small warning-icon tile on the neutral row.
  for (const line of outside) {
    assert.match(line, /const dangerButton|tone === "danger"|bg-red-50 text-red-600/, `unexpected red styling: ${line.trim().slice(0, 80)}`);
  }
  assert.match(panels, /tone=\{danger \? "danger" : "neutral"\}/);
});

// ---- Dialog behaviour ---------------------------------------------------------------------------

test("dialogs are accessible: labelled, modal, focus-trapped, dismissible, and return focus", async () => {
  const dialog = await read(DIALOG);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  // Keys are handled on the document so Escape/Tab still work after a step change drops focus to <body>.
  assert.match(dialog, /document\.addEventListener\("keydown"/);
  assert.match(dialog, /MutationObserver/);
  assert.match(dialog, /panelRef\.current\?\.focus\(\)/);
  assert.match(dialog, /target\?\.focus\(\)/, "focus returns to the opener on close");
  assert.match(dialog, /size-11/, "close button is a touch-sized target");
  // An operation in flight cannot be dismissed by Escape, the backdrop or the close button.
  assert.match(dialog, /if \(!busy\) onClose\(\)/);
  assert.match(dialog, /onMouseDown=\{\(event\) => \{ if \(event\.target === event\.currentTarget && !busy\) onClose\(\)/);
  assert.match(dialog, /disabled=\{busy\}/);
});

test("transfer, vehicle sale and asset loss each review before executing and cannot double-submit", async () => {
  const panels = await read(PANELS);
  assert.equal((panels.match(/useSingleSubmit\(state\)/g) ?? []).length, 4);
  assert.equal((panels.match(/useState<Step>\("edit"\)/g) ?? []).length, 3);
  for (const label of ["Review transfer", "Confirm transfer", "End service and remove tracker", "Record asset as lost"]) assert.match(panels, new RegExp(label));
  // Entering the review step never submits; only the review step's form submission reaches the server action.
  assert.equal((panels.match(/if \(step === "edit"\) \{\s*event\.preventDefault\(\);\s*setStep\("review"\);\s*return;/g) ?? []).length, 3);
  // Pending disables the confirm button and the dialog.
  assert.equal((panels.match(/busy=\{pending\}/g) ?? []).length, 3);
  assert.match(panels, /disabled=\{pending\}[^>]*className=\{primaryButton\}>\{pending \? "Transferring…"/);
});

test("asset loss needs an explicit acknowledgement before the destructive button works", async () => {
  const panels = await read(PANELS);
  const loss = panels.slice(panels.indexOf("function AssetLostDialog("), panels.indexOf("// ---- The \"Other service actions\" list"));
  assert.match(loss, /type="checkbox"/);
  assert.match(loss, /disabled=\{pending \|\| !acknowledged\}/);
  assert.match(loss, /if \(!acknowledged\) \{\s*event\.preventDefault\(\)/, "the server action cannot run without the acknowledgement");
  assert.match(loss, /className=\{dangerButton\}/);
});

test("transfer review explains the unbilled cancel path", async () => {
  const panels = await read(PANELS);
  assert.match(panels, /If this service is already billing, it ends here on the transfer date/);
  assert.match(panels, /If it has not started billing yet, it is canceled here with no charge/);
  assert.match(panels, /joins that agreement.s next renewal/);
  assert.match(panels, /The tracker and its SIM move with the service/);
});

test("a transferred service missing its tracker can bring hardware from the predecessor", async () => {
  const [details, panels, actions] = await Promise.all([read(DETAILS), read(PANELS), read(ACTIONS)]);
  assert.match(details, /AdoptPredecessorHardwareButton/);
  assert.match(details, /predecessorItemId/);
  assert.match(panels, /Bring tracker and SIM from previous service/);
  assert.match(actions, /adoptPredecessorHardwareAction/);
  assert.match(functionBody(actions, "adoptPredecessorHardwareAction"), /requireManageableCanonicalItem\(/);
});

test("date rules are untouched: no default dates and no new client-side date limits on sale, loss or transfer", async () => {
  const panels = await read(PANELS);
  assert.match(panels, /effectiveUntil: ""/);
  assert.match(panels, /lossDate: ""/);
  assert.match(panels, /transferDate: ""/);
  assert.doesNotMatch(panels, /type="date"[^>]*(min|max)=/);
  assert.doesNotMatch(panels, /new Date\(\)\.toISOString/);
});

test("each dialog submits the existing server action with the ids that pin it to one service", async () => {
  const panels = await read(PANELS);
  for (const [action, fields] of [
    ["transferCanonicalServiceAction", ["subscriptionId", "subscriptionItemId", "targetSubscriptionId", "transferDate", "agreedAmountPerCycle", "classification", "changeReason"]],
    ["removeCanonicalServiceForVehicleSaleAction", ["subscriptionId", "subscriptionItemId", "assignmentId", "effectiveUntil", "deviceDisposition", "removalNote"]],
    ["recordCanonicalAssetLossAction", ["subscriptionId", "subscriptionItemId", "assignmentId", "lossDate", "lossReason", "lossNote"]],
  ] as const) {
    assert.match(panels, new RegExp(`useActionState\\(${action}`));
    for (const field of fields) assert.match(panels, new RegExp(`name="${field}"`), `${action} needs ${field}`);
  }
});

test("existing workflows are reused, not reimplemented", async () => {
  const panels = await read(PANELS);
  for (const reused of ["ScheduleCanonicalDraftRateForm", "CanonicalServiceHardwareReplacementForm", "CanonicalServicePauseForm", "CanonicalServiceResumeForm"]) assert.match(panels, new RegExp(reused));
  // Guided replacement and SIM swap stay on their existing dedicated, reviewed pages.
  assert.match(panels, /`\/admin\/devices\/\$\{device\.id\}\/replace`/);
  assert.match(panels, /`\/admin\/devices\/\$\{device\.id\}\/swap-sim`/);
  // The superseded permanently-expanded forms are gone.
  const forms = await read("components/admin/canonical-subscription-operations-form.tsx");
  assert.doesNotMatch(forms, /export function Canonical(VehicleSaleRemoval|AssetLoss|ServiceTransfer)Form/);
});

test("replace tracker is one control: a direct link, or one dialog when a second route exists", async () => {
  const panels = await read(PANELS);
  assert.match(panels, /replacementAssignments\.length === 0/);
  assert.equal((panels.match(/Replace tracker<\/(button|Link)>/g) ?? []).length, 2, "one entry per branch, never both rendered");
});

// ---- Server-side safety is unchanged ------------------------------------------------------------

test("operations still cannot reach another service or subscription", async () => {
  const actions = await read(ACTIONS);
  const itemGuard = actions.slice(actions.indexOf("async function requireManageableCanonicalItem("), actions.indexOf("function revalidateCanonicalServiceOperation("));
  assert.match(itemGuard, /item\.customerSubscriptionId !== subscriptionId/);
  for (const name of ["transferCanonicalServiceAction", "adoptPredecessorHardwareAction", "removeCanonicalServiceForVehicleSaleAction", "recordCanonicalAssetLossAction", "pauseCanonicalServiceAssignmentAction", "resumeCanonicalServiceAssignmentAction", "scheduleCanonicalDraftRateAction", "replaceCanonicalServiceHardwareAction"]) {
    assert.match(functionBody(actions, name), /requireManageableCanonicalItem\(/, `${name} must verify the service belongs to the subscription`);
  }
  for (const name of ["removeCanonicalServiceForVehicleSaleAction", "recordCanonicalAssetLossAction"]) {
    assert.match(functionBody(actions, name), /requireOpenCanonicalServiceAssignment\(/, `${name} must verify the assignment belongs to the service`);
  }
});

test("the redesign adds no write path: history and presentation modules never mutate", async () => {
  const [history, presentation, panelData] = await Promise.all([
    read("lib/domain/canonical-service-history.ts"),
    read("lib/domain/canonical-service-presentation.ts"),
    read("lib/admin/canonical-subscription-page-data.ts"),
  ]);
  for (const source of [history, presentation]) assert.doesNotMatch(source, /prisma\.|lib\/db|\.(create|update|delete|upsert)\(/);
  const loader = panelData.slice(panelData.indexOf("export async function loadServiceHistory("), panelData.indexOf("export async function loadManageableServiceOperationTargets("));
  assert.doesNotMatch(loader, /\.(create|update|updateMany|delete|deleteMany|upsert)\(/);
  assert.match(loader, /catch \(error\)/, "an unreadable audit log must not take the page down");
});

// ---- History -----------------------------------------------------------------------------------

test("service history is compact on the screen and complete on its own route", async () => {
  const history = await read(HISTORY);
  assert.match(history, /RECENT_LIMIT = 5/);
  for (const column of ["Date", "Event", "Details"]) assert.match(history, new RegExp(`>${column}<`));
  assert.match(history, /Full history/);
  assert.match(history, /\/history`/);
  // The complete route keeps the untouched pricing and assignment records, with effective dates.
  assert.match(history, /Price history/);
  assert.match(history, /Hardware assignments/);
  assert.match(history, /displayDate\(entry\.effectiveFrom\)/);
  assert.match(history, /displayDate\(assignment\.startDate/);
  assert.doesNotMatch(history, /<details[\s>]/);
});

// ---- Subscription summary and Stripe status ------------------------------------------------------

test("ended sibling agreements are hidden on the detail header until staff unhides them", async () => {
  const [header, nav] = await Promise.all([
    read("components/admin/canonical-subscription/subscription-header.tsx"),
    read("components/admin/canonical-subscription/subscription-siblings-nav.tsx"),
  ]);
  assert.match(header, /SubscriptionSiblingsNav/);
  assert.doesNotMatch(header, /This customer has \{subscription\.siblings\.length\} subscriptions/);
  assert.match(nav, /Show \$\{endedCount\} ended agreement/);
  assert.match(nav, /Hide ended agreements/);
  assert.match(nav, /visibleSubscriptionSiblings\(siblings, showEnded\)/);
  assert.match(nav, /useState\(false\)/);
});

test("the subscription summary is one strip with the five required facts", async () => {
  const [header, strip] = await Promise.all([
    read("components/admin/canonical-subscription/subscription-header.tsx"),
    read("components/admin/canonical-subscription/summary-strip.tsx"),
  ]);
  assert.match(header, /<SummaryStrip/);
  assert.doesNotMatch(header, /aria-label="Subscription summary"/);
  assert.match(strip, /lg:grid-cols-4/);
  for (const label of ["Subscription total", "Next renewal", "Billing method", "Outstanding"]) assert.match(strip, new RegExp(label));
  assert.match(strip, /billable service/, "the number of billable services is shown");
  assert.match(header, /billsOnDate\(item, subscription\.nextBillingDate\)/, "the count still comes from the billing resolver's window");
  assert.match(header, /subscription\.summary\?\.recurringCycleTotal/);
  assert.match(header, /subscription\.summary\?\.outstandingBalance/);
});

test("a healthy Stripe check is a quiet indicator, while a mismatch keeps its full warning and action", async () => {
  const source = await read("components/admin/canonical-subscription/stripe-quantity-check.tsx");
  const healthy = source.slice(source.indexOf('check.state === "in_sync"'), source.indexOf('check.state === "unavailable"'));
  assert.match(healthy, /Stripe quantity in sync/);
  assert.doesNotMatch(healthy, /bg-emerald-50|border-emerald-200|rounded-lg border/, "no large success banner");
  assert.match(source, /role="alert"/);
  assert.match(source, /Stripe will bill/);
  assert.match(source, /StripeSyncPanel/);
  assert.match(source, /Stripe quantity not checked/);
  assert.match(source, /compareTlStripeSubscription/, "the live check itself is untouched");
});
