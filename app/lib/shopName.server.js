import db from "../db.server.js";
import { getValidAccessToken } from "./tokenRefresh.server.js";

const API_VERSION = "2025-01";

// The .myshopify.com domain rarely matches a merchant's actual storefront
// name/brand, so we fetch the real display name once via the Admin API and
// cache it on the Session row — avoids manually looking each one up, and
// avoids re-fetching on every dashboard load.
export async function getShopDisplayName(shop, cachedName) {
  if (cachedName) return cachedName;

  try {
    const accessToken = await getValidAccessToken(shop);
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: `{ shop { name } }` }),
    });
    const data = await res.json();
    const name = data?.data?.shop?.name;
    if (!name) return null;

    await db.session.updateMany({ where: { shop }, data: { shopName: name } });
    return name;
  } catch {
    return null;
  }
}
