import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAppPricingCacheForTests,
  fetchActiveSubscription,
  getPlanSelectionUrl,
  isAppPricingEnforcedForShop,
} from "../app/lib/shopifyAppPricing.server.js";

const env = {
  SHOPIFY_PARTNER_ORG_ID: "12345",
  SHOPIFY_PARTNER_API_ACCESS_TOKEN: "test-token",
  SHOPIFY_APP_GID: "gid://shopify/App/12345",
  SHOPIFY_APP_HANDLE: "studyperks",
  SHOPIFY_PARTNER_API_VERSION: "2026-07",
};

test("builds the Shopify plan selection URL from the authenticated shop domain", () => {
  assert.equal(
    getPlanSelectionUrl("founding-brand.myshopify.com", env),
    "https://admin.shopify.com/store/founding-brand/charges/studyperks/pricing_plans",
  );
});

test("rejects a non-Shopify shop domain when building a plan selection URL", () => {
  assert.throws(() => getPlanSelectionUrl("not-a-shop.example", env), /valid myshopify\.com/);
});

test("limits staged enforcement to explicitly listed shops while the global switch is off", () => {
  const stagedEnv = {
    SHOPIFY_APP_PRICING_ENFORCED: "false",
    SHOPIFY_APP_PRICING_TEST_SHOPS: "the-woo-5021.myshopify.com, another-shop.myshopify.com",
  };

  assert.equal(isAppPricingEnforcedForShop("the-woo-5021.myshopify.com", stagedEnv), true);
  assert.equal(isAppPricingEnforcedForShop("THE-WOO-5021.MYSHOPIFY.COM", stagedEnv), true);
  assert.equal(isAppPricingEnforcedForShop("other-brand.myshopify.com", stagedEnv), false);
});

test("global enforcement takes precedence over the staged shop list", () => {
  assert.equal(
    isAppPricingEnforcedForShop("other-brand.myshopify.com", {
      SHOPIFY_APP_PRICING_ENFORCED: "true",
      SHOPIFY_APP_PRICING_TEST_SHOPS: "the-woo-5021.myshopify.com",
    }),
    true,
  );
});

test("queries the Partner API for the current subscription and caches confirmed subscriptions", async () => {
  clearAppPricingCacheForTests();
  let requests = 0;
  const subscription = {
    billingPeriod: "EVERY_30_DAYS",
    cancelAtEndOfCycle: false,
    trialEndsAt: null,
    items: [{ handle: "basic_monthly", description: "StudyPerks Basic" }],
  };
  const fetchImpl = async (url, options) => {
    requests += 1;
    assert.equal(url, "https://partners.shopify.com/12345/api/2026-07/graphql.json");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-Shopify-Access-Token"], "test-token");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.variables, {
      appId: "gid://shopify/App/12345",
      shopId: "gid://shopify/Shop/67890",
    });
    assert.match(body.query, /activeSubscription\(appId: \$appId, shopId: \$shopId\)/);
    return Response.json({ data: { activeSubscription: subscription } });
  };

  const first = await fetchActiveSubscription("gid://shopify/Shop/67890", { env, fetchImpl });
  const second = await fetchActiveSubscription("gid://shopify/Shop/67890", { env, fetchImpl });

  assert.deepEqual(first, subscription);
  assert.deepEqual(second, subscription);
  assert.equal(requests, 1);
});

test("does not cache a confirmed absence of a subscription", async () => {
  clearAppPricingCacheForTests();
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return Response.json({ data: { activeSubscription: null } });
  };

  assert.equal(await fetchActiveSubscription("gid://shopify/Shop/none", { env, fetchImpl }), null);
  assert.equal(await fetchActiveSubscription("gid://shopify/Shop/none", { env, fetchImpl }), null);
  assert.equal(requests, 2);
});

test("surfaces Partner API failures instead of treating them as an unpaid shop", async () => {
  clearAppPricingCacheForTests();
  const fetchImpl = async () => Response.json({ errors: [{ message: "Not authorized" }] });

  await assert.rejects(
    fetchActiveSubscription("gid://shopify/Shop/failure", { env, fetchImpl }),
    /GraphQL error: Not authorized/,
  );
});
