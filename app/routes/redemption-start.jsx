import { randomBytes } from "node:crypto";
import { json } from "@remix-run/node";
import db from "../db.server";
import { getAllowedStorefrontOrigins } from "../lib/storefrontOrigins.server";

const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
const SHOP_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export async function action({ request }) {
  let shop, origin;
  try {
    ({ shop, origin } = await request.json());
  } catch {
    return json({ error: "Invalid request" }, { status: 400, headers: CORS });
  }
  if (!SHOP_PATTERN.test(shop || "")) return json({ error: "Invalid shop" }, { status: 400, headers: CORS });
  let parsedOrigin;
  try { parsedOrigin = new URL(origin).origin; }
  catch { return json({ error: "Invalid storefront origin" }, { status: 400, headers: CORS }); }

  const config = await db.discountConfig.findUnique({ where: { shop } });
  if (!config) return json({ error: "Shop is not configured" }, { status: 404, headers: CORS });
  try {
    const allowed = await getAllowedStorefrontOrigins(shop);
    if (!allowed.has(parsedOrigin)) return json({ error: "Storefront origin is not registered to this shop" }, { status: 403, headers: CORS });
    const state = randomBytes(32).toString("base64url");
    await db.redemptionFlow.create({
      data: { state, shop, origin: parsedOrigin, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    const url = new URL("https://www.studyperks.me/shopify-connect");
    url.searchParams.set("state", state);
    url.searchParams.set("shop", shop);
    url.searchParams.set("origin", parsedOrigin);
    return json({ url: url.toString() }, { headers: CORS });
  } catch (error) {
    console.error("redemption-start failed:", error);
    return json({ error: "Could not start secure verification" }, { status: 502, headers: CORS });
  }
}

export async function loader() {
  return new Response(null, { status: 405, headers: CORS });
}
