import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertLocalPostgres,
  isIntegrationFixtureCompany,
  isSafeIntegrationFixtureCustomer,
  RemotePostgresTestDatabaseError,
} from "./postgres/integration-db";

test("postgres integration tests accept only localhost DATABASE_URL values", () => {
  assert.doesNotThrow(() =>
    assertLocalPostgres("postgresql://tlportal:tlportal@127.0.0.1:5432/tlportal_test?schema=public"),
  );
  assert.doesNotThrow(() =>
    assertLocalPostgres("postgresql://tlportal:tlportal@localhost:5432/tlportal"),
  );
  assert.throws(
    () => assertLocalPostgres("postgresql://u:p@ep-example.neon.tech/neondb"),
    RemotePostgresTestDatabaseError,
  );
  assert.throws(() => assertLocalPostgres(""), RemotePostgresTestDatabaseError);
});

test("integration fixture names match synthetic test companies only", () => {
  assert.equal(isIntegrationFixtureCompany("phase-3a-2e4f55c3-730f-4b6b-9a78-492a91f066f1"), true);
  assert.equal(isIntegrationFixtureCompany("multiple-subscriptions-605db574-9d9d-402d-ac3a-3ce48f7e6aab"), true);
  assert.equal(isIntegrationFixtureCompany("Phase 3B2 7a31ced7-e593-4fb6-935c-6ec98cc18507"), true);
  assert.equal(isIntegrationFixtureCompany("365 Car Rentals"), false);
  assert.equal(isIntegrationFixtureCompany("Naim Augustin"), false);
  assert.equal(isIntegrationFixtureCompany("St. Lucia National Trust"), false);
});

test("fixture cleanup refuses customers that look like real accounts", () => {
  const base = {
    id: "x",
    company: "phase-3a-2e4f55c3-730f-4b6b-9a78-492a91f066f1",
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    billingAccounts: [],
    customerSubscriptions: [{ stripeCustomerId: null, stripeSubscriptionId: null }],
  };
  assert.equal(isSafeIntegrationFixtureCustomer(base), true);
  assert.equal(isSafeIntegrationFixtureCustomer({ ...base, firstName: "Naim" }), false);
  assert.equal(isSafeIntegrationFixtureCustomer({ ...base, phone: "+17580000000" }), false);
  assert.equal(isSafeIntegrationFixtureCustomer({
    ...base,
    customerSubscriptions: [{ stripeCustomerId: "cus_live", stripeSubscriptionId: null }],
  }), false);
});
