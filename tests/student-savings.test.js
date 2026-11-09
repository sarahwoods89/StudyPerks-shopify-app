import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { findStudyPerksCode, extractOrderValues } from "../app/lib/affiliateOrder.server.js";
import { aggregateSavings, verifySavingsSignature } from "../app/lib/studentSavings.server.js";

const hash = "a".repeat(64);
const base = { id: "1001", currency: "EUR", current_total_price: "80.00", discount_codes: [{ code: "SP-ABC123", amount: "20.00", type: "fixed_amount" }] };

test("unrelated discounts are ignored and specific StudyPerks amount is selected", () => {
  assert.equal(findStudyPerksCode({ discount_codes: [{ code: "WELCOME10", amount: "10" }] }), null);
  const values = extractOrderValues(base);
  assert.equal(values.code, "SP-ABC123");
  assert.equal(values.discountAmount, 20);
  assert.equal(values.currencyCode, "EUR");
});

test("legacy shared code is aggregate-only and missing numeric data is rejected", () => {
  const values = extractOrderValues({ ...base, discount_codes: [{ code: "STUDYPERKS", amount: "5" }] });
  assert.equal(values.unique, false);
  assert.equal(extractOrderValues({ ...base, currency: undefined }), null);
});

test("savings remain separated by currency and rounded", () => {
  const result = aggregateSavings([
    { currencyCode: "EUR", discountAmount: 20.005, orderTotal: 80, },
    { currencyCode: "EUR", discountAmount: 2.4, orderTotal: 10, },
    { currencyCode: "GBP", discountAmount: 5, orderTotal: 30, },
  ]);
  assert.deepEqual(result, [
    { currencyCode: "EUR", totalSaved: 22.41, totalSpent: 90, orderCount: 2 },
    { currencyCode: "GBP", totalSaved: 5, totalSpent: 30, orderCount: 1 },
  ]);
});

test("savings endpoint HMAC rejects stale or altered requests", () => {
  const secret = "test-savings-secret-with-at-least-32-characters";
  const body = JSON.stringify({ identityHash: hash });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  assert.equal(verifySavingsSignature({ timestamp, signature, rawBody: body, secret }), true);
  assert.equal(verifySavingsSignature({ timestamp, signature, rawBody: `${body} `, secret }), false);
  assert.equal(verifySavingsSignature({ timestamp: String(Number(timestamp) - 301), signature, rawBody: body, secret }), false);
  assert.equal(verifySavingsSignature({ timestamp, signature: "0".repeat(64), rawBody: body, secret }), false);
});
