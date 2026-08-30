import { getValidAccessToken } from "./tokenRefresh.server.js";

const API_VERSION = "2025-01";

export async function getAllowedStorefrontOrigins(shop) {
  const accessToken = await getValidAccessToken(shop);
  const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: `{ shop { myshopifyDomain primaryDomain { url } } }` }),
  });
  if (!response.ok) throw new Error("Could not resolve storefront domains");
  const data = await response.json();
  const shopData = data?.data?.shop;
  const origins = new Set([`https://${shop}`]);
  if (shopData?.myshopifyDomain) origins.add(`https://${shopData.myshopifyDomain}`);
  if (shopData?.primaryDomain?.url) origins.add(new URL(shopData.primaryDomain.url).origin);
  return origins;
}
