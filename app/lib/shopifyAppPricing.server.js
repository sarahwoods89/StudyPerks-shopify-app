const ACTIVE_SUBSCRIPTION_TTL_MS = 5 * 60 * 1000;
const activeSubscriptionCache = new Map();
const inFlightRequests = new Map();

const ACTIVE_SUBSCRIPTION_QUERY = `
  query StudyPerksActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      billingPeriod
      cancelAtEndOfCycle
      trialEndsAt
      items {
        handle
        description
      }
    }
  }
`;

export function isAppPricingEnforcedForShop(shopDomain, env = process.env) {
  if (env.SHOPIFY_APP_PRICING_ENFORCED === "true") return true;

  const testShops = (env.SHOPIFY_APP_PRICING_TEST_SHOPS || "")
    .split(",")
    .map((shop) => shop.trim().toLowerCase())
    .filter(Boolean);

  return testShops.includes((shopDomain || "").trim().toLowerCase());
}

function getPricingConfig(env = process.env) {
  const config = {
    organizationId: env.SHOPIFY_PARTNER_ORG_ID,
    accessToken: env.SHOPIFY_PARTNER_API_ACCESS_TOKEN,
    appId: env.SHOPIFY_APP_GID,
    appHandle: env.SHOPIFY_APP_HANDLE,
    apiVersion: env.SHOPIFY_PARTNER_API_VERSION || "2026-07",
  };

  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "apiVersion" && !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing Shopify App Pricing configuration: ${missing.join(", ")}`);
  }

  return config;
}

export function getPlanSelectionUrl(shopDomain, env = process.env) {
  const { appHandle } = getPricingConfig(env);
  const shopMatch = /^([a-z0-9][a-z0-9-]*)\.myshopify\.com$/i.exec(shopDomain || "");

  if (!shopMatch) {
    throw new Error("The authenticated shop domain is not a valid myshopify.com domain");
  }

  return `https://admin.shopify.com/store/${encodeURIComponent(shopMatch[1])}/charges/${encodeURIComponent(appHandle)}/pricing_plans`;
}

export async function fetchActiveSubscription(shopId, {
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const { organizationId, accessToken, appId, apiVersion } = getPricingConfig(env);
  const cacheKey = `${organizationId}:${appId}:${shopId}`;
  const cached = activeSubscriptionCache.get(cacheKey);

  if (cached && cached.expiresAt > now()) return cached.value;
  if (inFlightRequests.has(cacheKey)) return inFlightRequests.get(cacheKey);

  const request = (async () => {
    const response = await fetchImpl(
      `https://partners.shopify.com/${encodeURIComponent(organizationId)}/api/${encodeURIComponent(apiVersion)}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: ACTIVE_SUBSCRIPTION_QUERY,
          variables: { appId, shopId },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Shopify Partner API returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.errors?.length) {
      throw new Error(`Shopify Partner API GraphQL error: ${payload.errors[0]?.message || "unknown error"}`);
    }
    if (!payload || !Object.hasOwn(payload, "data") || !Object.hasOwn(payload.data || {}, "activeSubscription")) {
      throw new Error("Shopify Partner API returned an unexpected subscription response");
    }

    const subscription = payload.data.activeSubscription;
    if (subscription) {
      activeSubscriptionCache.set(cacheKey, {
        value: subscription,
        expiresAt: now() + ACTIVE_SUBSCRIPTION_TTL_MS,
      });
    }

    return subscription;
  })();

  inFlightRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export function clearAppPricingCacheForTests() {
  activeSubscriptionCache.clear();
  inFlightRequests.clear();
}
