import { timingSafeEqual } from "node:crypto";
import { json } from "@remix-run/node";
import db from "../db.server";
import { enqueueOfferSync } from "../lib/offerQueue.server";
import { getDiscountId } from "../lib/discountCodes.server";
import { getValidAccessToken } from "../lib/tokenRefresh.server";

function authorizedReconciliation(request) {
  const secret = process.env.STUDYPERKS_OFFER_RECONCILE_TOKEN;
  const supplied = request.headers.get("Authorization") || "";
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function loader() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function action({ request }) {
  const headers = { "Cache-Control": "no-store" };
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  if (!authorizedReconciliation(request)) return json({ error: "Unauthorized" }, { status: 401, headers });
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400, headers }); }
  if (!Array.isArray(body.shops) || !body.shops.length || body.shops.length > 10
    || body.shops.some((shop) => typeof shop !== "string" || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))) {
    return json({ error: "Supply 1 to 10 explicit myshopify.com domains." }, { status: 400, headers });
  }
  // Preview is the default. There is intentionally no unbounded 'all shops'.
  const apply = body.confirm === "SYNC_CONFIRMED_OFFERS";
  const results = [];
  for (const shop of [...new Set(body.shops)]) {
    const config = await db.discountConfig.findUnique({ where: { shop } });
    const installed = await db.session.count({ where: { shop, isOnline: false } });
    let discountId = config?.discountId;
    if (installed && config && !discountId) {
      try {
        const token = await getValidAccessToken(shop);
        if (token) discountId = await getDiscountId(shop, token, { cache: false, allowTitle: false });
      } catch {
        results.push({ shop, status: "shopify_lookup_failed" });
        continue;
      }
    }
    const eligible = Boolean(installed && discountId);
    if (apply && eligible) {
      await db.$transaction(async (tx) => {
        if (!config.discountId) await tx.discountConfig.updateMany({ where: { shop, discountId: null }, data: { discountId } });
        await enqueueOfferSync(shop, tx, { force: true });
      });
    }
    results.push({ shop, discountId: discountId || null,
      status: !installed ? "not_installed" : !discountId ? "needs_verified_discount_id" : apply ? "queued" : "ready" });
  }
  return json({ dryRun: !apply, results }, { headers });
}
