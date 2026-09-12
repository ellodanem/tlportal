import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canCopyForShare,
  canFeatureFeedback,
  compactQuote,
  formatFeedbackCaption,
  formatFeedbackQuote,
} from "./share-copy";

describe("feedback share gating", () => {
  it("blocks copy and featuring when share permission is off", () => {
    assert.equal(canCopyForShare(false), false);
    assert.equal(canFeatureFeedback(false), false);
    assert.equal(
      formatFeedbackQuote({ body: "Great install.", displayName: "Maria", sharePermission: false }),
      null,
    );
    assert.equal(
      formatFeedbackCaption({ body: "Great install.", displayName: "Maria", sharePermission: false }),
      null,
    );
  });

  it("allows copy and featuring when the visitor opted in", () => {
    assert.equal(canCopyForShare(true), true);
    assert.equal(canFeatureFeedback(true), true);
  });
});

describe("feedback quote and caption", () => {
  it("formats a quote with attribution", () => {
    assert.equal(
      formatFeedbackQuote({ body: "Great install.", displayName: "Maria", sharePermission: true }),
      `"Great install." — Maria`,
    );
  });

  it("omits the dash when there is no name", () => {
    assert.equal(
      formatFeedbackQuote({ body: "Fast support.", displayName: null, sharePermission: true }),
      `"Fast support."`,
    );
  });

  it("formats a ready-to-paste social caption", () => {
    assert.equal(
      formatFeedbackCaption({ body: "Great install.", displayName: "Maria", sharePermission: true }),
      ["A note from a Track Lucia customer:", "", `"Great install."`, "— Maria"].join("\n"),
    );
  });

  it("shortens long quotes", () => {
    const long = "ok ".repeat(200);
    const compact = compactQuote(long, 40);
    assert.ok(compact.endsWith("…"));
    assert.ok(compact.length <= 40);
  });
});
