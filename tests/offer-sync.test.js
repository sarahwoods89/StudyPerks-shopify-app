import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { brand } from "../app/lib/brand.js";

async function load(file, imports, globals = {}) {
  const context = vm.createContext({ console, Buffer, Response, Request, URL, AbortSignal,
    setInterval, process: { env: {} }, ...globals });
  let source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  // Exercise the actual route action; its unrelated JSX component is excluded.
  source = source.split("export default function Settings()")[0];
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    const exports = imports[specifier];
    if (!exports) throw new Error(`Missing test import: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

const json = (body, options) => Response.json(body, options);
const shop = "example.myshopify.com";
const config = { shop, discountId: "gid://shopify/DiscountCodeNode/123", discountName: "Student",
  discountType: "percentage", discountValue: 10, discountCollections: [] };
const fixture = () => ({ shop: { name: "Example", currencyCode: "EUR" }, codeDiscountNode: {
  id: config.discountId, codeDiscount: { __typename: "DiscountCodeBasic", title: "Student", status: "ACTIVE",
    startsAt: "2026-01-01T00:00:00Z", endsAt: null, context: { __typename: "DiscountBuyerSelectionAll" },
    minimumRequirement: null, customerGets: { value: { __typename: "DiscountPercentage", percentage: 0.2 },
      items: { __typename: "AllDiscountItems", allItems: true } } } } });
const snapshot = () => load("app/lib/offerSnapshot.server.js", {
  "node:crypto": { createHash: crypto.createHash }, "./tokenRefresh.server.js": { getValidAccessToken: async () => "test" },
});

test("confirmed offers use Shopify's percentage, ID and currency", async () => {
  const { normalizeOffer } = await snapshot();
  const offer = normalizeOffer(config, fixture());
  assert.equal(offer.discountValue, 20);
  assert.equal(offer.shopifyDiscountId, config.discountId);
  assert.equal(offer.currencyCode, "EUR");
  assert.equal(offer.active, true);
});

test("collection restrictions are preserved; unsupported restrictions are never advertised as all products", async () => {
  const { normalizeOffer } = await snapshot();
  const data = fixture();
  data.codeDiscountNode.codeDiscount.customerGets.items = { __typename: "DiscountCollections",
    collections: { nodes: [{ id: "gid://shopify/Collection/5" }], pageInfo: { hasNextPage: false } } };
  const offer = normalizeOffer(config, data);
  assert.equal(offer.active, true);
  assert.equal(offer.appliesTo, "collections");
  assert.equal(offer.collectionIds[0], "gid://shopify/Collection/5");
  data.codeDiscountNode.codeDiscount.minimumRequirement = { __typename: "DiscountMinimumQuantity", greaterThanOrEqualToQuantity: 2 };
  assert.equal(normalizeOffer(config, data).active, false);
  data.codeDiscountNode.codeDiscount.minimumRequirement = null;
  data.codeDiscountNode.codeDiscount.customerGets.items.collections.pageInfo.hasNextPage = true;
  assert.equal(normalizeOffer(config, data).active, false);
});

test("deleted, scheduled and expired discounts become inactive", async () => {
  const { normalizeOffer } = await snapshot();
  const data = fixture();
  for (const status of ["SCHEDULED", "EXPIRED"]) {
    data.codeDiscountNode.codeDiscount.status = status;
    assert.equal(normalizeOffer(config, data).active, false);
  }
  data.codeDiscountNode = null;
  assert.equal(normalizeOffer(config, data).status, "DELETED");
  assert.equal(normalizeOffer(config, data).active, false);
});

test("redemption activity timestamps do not create a new offer fingerprint", async () => {
  const { normalizeOffer, offerFingerprint } = await snapshot();
  const offer = normalizeOffer(config, fixture());
  assert.equal(offerFingerprint(offer), offerFingerprint({ ...offer, updatedAt: "2099-01-01T00:00:00Z" }));
  assert.notEqual(offerFingerprint(offer), offerFingerprint({ ...offer, discountValue: 30 }));
});

test("sender signs timestamp plus exact body and rejects failed deliveries", async () => {
  let sent;
  const secret = "test-only-secret-with-at-least-32-characters";
  const { syncOfferToStudyPerks } = await load("app/lib/offerSync.server.js", { "node:crypto": { default: crypto } }, {
    process: { env: { STUDYPERKS_OFFER_SYNC_SECRET: secret } },
    fetch: async (url, options) => { sent = { url, ...options }; return new Response(null, { status: 503 }); },
  });
  await assert.rejects(syncOfferToStudyPerks(config), /HTTP 503/);
  assert.equal(sent.url, "https://www.studyperks.me/internal/shopify/offers");
  assert.equal(sent.headers["X-StudyPerks-Signature"], crypto.createHmac("sha256", secret)
    .update(`${sent.headers["X-StudyPerks-Timestamp"]}.${sent.body}`).digest("hex"));
  assert.equal(sent.redirect, "error");
});

async function settings(result, existingId = config.discountId) {
  const calls = [];
  const tx = { discountConfig: { upsert: async () => calls.push("persist") } };
  const mod = await load("app/routes/app.settings.jsx", {
    react: { useState: () => {} },
    "@shopify/polaris": Object.fromEntries(["Page", "Card", "Select", "TextField", "BlockStack", "Text", "Banner", "InlineStack", "Button"].map((key) => [key, () => {}])),
    "@shopify/app-bridge-react": { TitleBar: () => {} },
    "@remix-run/react": { Form: () => {}, useLoaderData: () => {}, useNavigation: () => {}, useActionData: () => {} },
    "@remix-run/node": { json },
    "../lib/brand": { brand },
    "../shopify.server": { authenticate: { admin: async () => ({ session: { shop, accessToken: "test" },
      admin: { graphql: async () => { calls.push("shopify"); return Response.json(result); } } }) } },
    "../db.server": { default: { $transaction: async (fn) => fn(tx) } },
    "../lib/discountCodes.server": { randomCode: () => "TEST", getDiscountId: async () => existingId },
    "../lib/offerQueue.server": { enqueueOfferSync: async () => calls.push("queue"),
      deliverOffer: async () => { calls.push("deliver"); return { pending: true }; } },
  });
  const request = new Request("https://example.com/app/settings", { method: "POST",
    body: new URLSearchParams({ name: "Student", type: "percentage", value: "20", scope: "all" }) });
  return { response: await mod.action({ request }), calls };
}

test("top-level GraphQL failure and absent mutation IDs never change local config or enqueue", async () => {
  for (const result of [{ errors: [{ message: "Denied" }] }, { data: { discountCodeBasicUpdate: { userErrors: [] } } },
    { data: { discountCodeBasicUpdate: { userErrors: [{ message: "Invalid" }] } } }]) {
    const { calls, response } = await settings(result);
    assert.ok(response.status >= 400);
    assert.deepEqual(calls, ["shopify"]);
  }
});

test("confirmed save persists and queues atomically before delivery; outage is a warning", async () => {
  const { calls, response } = await settings({ data: { discountCodeBasicUpdate: {
    codeDiscountNode: { id: config.discountId }, userErrors: [],
  } } });
  assert.deepEqual(calls, ["shopify", "persist", "queue", "deliver"]);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.match(result.syncWarning, /retry automatically/);
});

test("webhooks only queue the exact configured parent discount", async () => {
  let event;
  let queued = 0;
  const { action } = await load("app/routes/webhooks.discounts.jsx", {
    "../shopify.server": { authenticate: { webhook: async () => event } },
    "../db.server": { default: { discountConfig: { findUnique: async () => config } } },
    "../lib/offerQueue.server": { enqueueOfferSync: async () => queued++ },
  });
  for (const topic of ["DISCOUNTS_CREATE", "DISCOUNTS_UPDATE", "DISCOUNTS_DELETE"]) {
    event = { shop, topic, payload: { admin_graphql_api_id: config.discountId } };
    await action({ request: {} });
  }
  assert.equal(queued, 3);
  event = { shop, topic: "DISCOUNTS_UPDATE", payload: { admin_graphql_api_id: "gid://shopify/DiscountCodeNode/999" } };
  await action({ request: {} });
  event = { shop, topic: "DISCOUNTS_REDEEMCODE_ADDED", payload: { admin_graphql_api_id: config.discountId } };
  await action({ request: {} });
  assert.equal(queued, 3);
});

test("reconciliation requires a secret, defaults to preview and requires explicit confirmation", async () => {
  let queued = 0;
  const secret = "test-only-reconciliation-token-32-characters";
  const { action } = await load("app/routes/internal.offers.reconcile.jsx", {
    "node:crypto": { timingSafeEqual: crypto.timingSafeEqual }, "@remix-run/node": { json },
    "../db.server": { default: { discountConfig: { findUnique: async () => config },
      session: { count: async () => 1 }, $transaction: async (fn) => fn({}) } },
    "../lib/offerQueue.server": { enqueueOfferSync: async () => queued++ },
    "../lib/discountCodes.server": { getDiscountId: async () => null },
    "../lib/tokenRefresh.server": { getValidAccessToken: async () => null },
  }, { process: { env: { STUDYPERKS_OFFER_RECONCILE_TOKEN: secret } } });
  const request = (body, token = secret) => new Request("https://example.com/internal/offers/reconcile", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await action({ request: request({ shops: [shop] }, "wrong") })).status, 401);
  assert.equal((await action({ request: request({ shops: Array(11).fill(shop) }) })).status, 400);
  assert.equal((await (await action({ request: request({ shops: [shop] }) })).json()).dryRun, true);
  assert.equal(queued, 0);
  await action({ request: request({ shops: [shop], confirm: "SYNC_CONFIRMED_OFFERS" }) });
  assert.equal(queued, 1);
});

async function queueHarness({ fail = false, duplicate = false, concurrent = false } = {}) {
  let revision = 1;
  let sent = 0;
  let completed = false;
  const writes = [];
  const job = { shop, revision: 1, pending: true, nextAttemptAt: new Date(0), attempts: 0,
    lastFingerprint: duplicate ? "same" : null };
  const { deliverOffer } = await load("app/lib/offerQueue.server.js", {
    "../db.server.js": { default: {
      offerSyncState: { findUnique: async () => job, updateMany: async ({ where, data }) => {
        writes.push({ where, data });
        if (where.revision && where.revision !== revision) return { count: 0 };
        if (data.pending === false) completed = true;
        return { count: 1 };
      } },
      discountConfig: { findUnique: async () => config, updateMany: async () => ({ count: 1 }) },
    } },
    "./offerSnapshot.server.js": { fetchConfirmedOffer: async () => ({ ...config, active: true, status: "ACTIVE" }),
      offerFingerprint: () => "same" },
    "./offerSync.server.js": { syncOfferToStudyPerks: async () => {
      sent++;
      if (concurrent) revision++;
      if (fail) throw new Error("test outage");
    } },
  });
  const result = await deliverOffer(shop);
  return { result, sent, completed, writes };
}

test("outage retains the durable job and schedules backoff", async () => {
  const { result, completed, writes } = await queueHarness({ fail: true });
  assert.equal(result.pending, true);
  assert.equal(completed, false);
  const retry = writes.find(({ data }) => data.attempts?.increment);
  assert.ok(retry.data.nextAttemptAt > new Date());
  assert.equal(writes.at(-1).data.leaseUntil, null);
  assert.ok(writes.at(-1).where.leaseUntil);
});

test("duplicate webhook refresh avoids duplicate delivery", async () => {
  const result = await queueHarness({ duplicate: true });
  assert.equal(result.sent, 0);
  assert.equal(result.completed, true);
});

test("a newer change remains queued when the older delivery completes", async () => {
  const result = await queueHarness({ concurrent: true });
  assert.equal(result.sent, 1);
  assert.equal(result.completed, false);
});
