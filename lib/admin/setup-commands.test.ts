import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applySetupCommandTokens, hasUnresolvedSetupTokens } from "./setup-commands";

describe("setup command tokens", () => {
  it("fills known device values and leaves a blank APN token", () => {
    const body = applySetupCommandTokens("APN,{apn}# IMEI {imei}", {
      apn: "  ",
      imei: "123456789012345",
    });
    assert.equal(body, "APN,{apn}# IMEI 123456789012345");
    assert.equal(hasUnresolvedSetupTokens(body), true);
  });

  it("treats a fully filled command as ready to copy", () => {
    const body = applySetupCommandTokens("SERVER,1,d4.traqcare.com,5151,0#", { imei: "1" });
    assert.equal(body, "SERVER,1,d4.traqcare.com,5151,0#");
    assert.equal(hasUnresolvedSetupTokens(body), false);
  });
});
