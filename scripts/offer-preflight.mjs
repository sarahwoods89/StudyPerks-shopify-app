// Reads production offers; refreshes expired Shopify tokens through the app's
// existing flow. Never prints credentials or raw responses.
import "dotenv/config";
import db from "../app/db.server.js";
import { getValidAccessToken } from "../app/lib/tokenRefresh.server.js";
import { OFFER_QUERY, normalizeOffer } from "../app/lib/offerSnapshot.server.js";

try {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  console.log(JSON.stringify({ tables: tables.map((row) => row.tablename).sort() }));
  const configs = await db.discountConfig.findMany({ take: 10, orderBy: { shop: "asc" } });
  for (const config of configs) {
    const session = await db.session.findFirst({ where: { shop: config.shop, isOnline: false } });
    if (!session || !config.discountId) {
      console.log(JSON.stringify({ shop: config.shop, status: "missing_session_or_discount_id" }));
      continue;
    }
    const originalError = console.error;
    let token;
    try {
      console.error = () => originalError("Shopify token refresh unavailable; details withheld.");
      token = await getValidAccessToken(config.shop);
    } finally { console.error = originalError; }
    const response = await fetch(`https://${config.shop}/admin/api/2026-01/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: OFFER_QUERY, variables: { id: config.discountId } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.log(JSON.stringify({ shop: config.shop, httpStatus: response.status }));
      continue;
    }
    const result = await response.json();
    if (result.errors) {
      console.log(JSON.stringify({ shop: config.shop, graphqlErrors: result.errors.map((error) => error.message) }));
      continue;
    }
    const offer = normalizeOffer(config, result.data);
    console.log(JSON.stringify({ shop: config.shop, status: offer.status, active: offer.active,
      discountType: offer.discountType, discountValue: offer.discountValue, appliesTo: offer.appliesTo }));
  }
} catch {
  console.error("Offer preflight failed; credentials and raw errors withheld.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
