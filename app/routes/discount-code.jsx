import { json } from "@remix-run/node";
import db from "../db.server";
import { claimCode } from "../lib/discountCodes.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
const SHOP_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

// Public emails and wallet addresses are identifiers, not proof of control.
// StudyPerks validates the short-lived signed session and checks the token
// before this app issues a discount code.
async function verifyRedemptionAuthorization({ authorization, shop }) {
  try {
    const res = await fetch("https://www.studyperks.me/api/verify-redemption-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorization, shop }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.verified === true && data.eligible === true && typeof data.jti === "string"
      ? { jti: data.jti }
      : null;
  } catch (err) {
    console.error("StudyPerks session verification failed:", err);
    return null;
  }
}

export async function loader() {
  return new Response(null, { status: 405, headers: CORS_HEADERS });
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  let shop, authorization;
  try {
    const body = await request.json();
    shop = body?.shop;
    authorization = body?.authorization;
  } catch {
    return json({ error: "Invalid request body" }, { status: 400, headers: CORS_HEADERS });
  }

  if (typeof shop !== "string" || !SHOP_PATTERN.test(shop)) {
    return json({ error: "Missing or invalid shop" }, { status: 400, headers: CORS_HEADERS });
  }
  if (typeof authorization !== "string" || authorization.length < 20 || authorization.length > 4096) {
    return json({ error: "A valid StudyPerks authorization is required" }, { status: 401, headers: CORS_HEADERS });
  }

  const config = await db.discountConfig.findUnique({ where: { shop } });
  if (!config) {
    return json({ error: "StudyPerks is not configured for this shop" }, { status: 404, headers: CORS_HEADERS });
  }
  const verified = await verifyRedemptionAuthorization({ authorization, shop });
  if (!verified) {
    return json({ error: "Invalid, expired, or ineligible StudyPerks authorization" }, { status: 403, headers: CORS_HEADERS });
  }

  try {
    await db.redemptionAuthorization.create({ data: { jti: verified.jti, shop } });
    const code = await claimCode(shop);
    return json({ code }, { headers: CORS_HEADERS });
  } catch (err) {
    if (err?.code === "P2002") {
      return json({ error: "This StudyPerks authorization has already been used" }, { status: 409, headers: CORS_HEADERS });
    }
    console.error(`discount-code claim error for ${shop}:`, err);
    return json({ error: "Could not issue a discount code" }, { status: 500, headers: CORS_HEADERS });
  }
}
