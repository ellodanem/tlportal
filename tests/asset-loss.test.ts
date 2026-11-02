import assert from "node:assert/strict";
import test from "node:test";

import {
  appendNote,
  ASSET_LOSS_REASONS,
  assetLossNote,
  parseAssetLossReason,
  parseLossDate,
} from "../lib/domain/asset-loss";

test("asset loss reasons parse strictly", () => {
  for (const reason of ASSET_LOSS_REASONS) assert.equal(parseAssetLossReason(` ${reason} `), reason);
  assert.equal(parseAssetLossReason("sold"), null);
  assert.equal(parseAssetLossReason(""), null);
});

test("loss date accepts only real calendar dates", () => {
  assert.equal(parseLossDate("2026-10-31")?.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(parseLossDate("2026-02-30"), null);
  assert.equal(parseLossDate("31/10/2026"), null);
  assert.equal(parseLossDate(""), null);
});

test("loss note is a single audit line and appends without clobbering history", () => {
  const note = assetLossNote({ reason: "sank", lossDate: "2026-10-31", note: " Off Rodney Bay " });
  assert.equal(note, "Asset lost — Sank / lost at sea (2026-10-31); tracker unrecoverable. Off Rodney Bay");
  assert.equal(assetLossNote({ reason: "stolen", lossDate: "2026-10-31" }).includes("Stolen"), true);
  assert.equal(appendNote(null, note), note);
  assert.equal(appendNote("Existing", note), `Existing\n${note}`);
});
