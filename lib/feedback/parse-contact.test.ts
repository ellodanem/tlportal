import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseFeedbackContact, parseFeedbackRating } from "./parse-contact";
import { feedbackListWhere, parseFeedbackListFilter } from "./status";

describe("parseFeedbackContact", () => {
  it("treats @ as email", () => {
    assert.deepEqual(parseFeedbackContact("  jane@example.com "), { email: "jane@example.com", phone: null });
  });

  it("treats other values as phone", () => {
    assert.deepEqual(parseFeedbackContact("7581234567"), { email: null, phone: "7581234567" });
  });
});

describe("parseFeedbackRating", () => {
  it("accepts 1-5 and treats empty or invalid as missing (submit requires a value)", () => {
    assert.equal(parseFeedbackRating("5"), 5);
    assert.equal(parseFeedbackRating("1"), 1);
    assert.equal(parseFeedbackRating(""), null);
    assert.equal(parseFeedbackRating("9"), null);
  });
});

describe("feedback list filters", () => {
  it("defaults unknown values to New (inbox)", () => {
    assert.equal(parseFeedbackListFilter(undefined), "new");
    assert.deepEqual(feedbackListWhere("new"), { status: "inbox" });
    assert.deepEqual(feedbackListWhere("private"), { sharePermission: false });
  });
});
