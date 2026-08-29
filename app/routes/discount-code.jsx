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
async function verifyRedemptionSession({ session, shop }) {
  try {
    const res = await fetch("https://www.studyperks.me/api/verify-redemption-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, shop }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.verified === true && data.eligible === true;
  } catch (err) {
    console.error("StudyPerks session verification failed:", err);
    return false;
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

  let shop, session;
  try {
    const body = await request.json();
    shop = body?.shop;
    session = body?.session;
  } catch {
    return json({ error: "Invalid request body" }, { status: 400, headers: CORS_HEADERS });
  }

  if (typeof shop !== "string" || !SHOP_PATTERN.test(shop)) {
    return json({ error: "Missing or invalid shop" }, { status: 400, headers: CORS_HEADERS });
  }
  if (typeof session !== "string" || session.length < 20 || session.length > 4096) {
    return json({ error: "A valid StudyPerks session is required" }, { status: 401, headers: CORS_HEADERS });
  }

  const config = await db.discountConfig.findUnique({ where: { shop } });
  if (!config) {
    return json({ error: "StudyPerks is not configured for this shop" }, { status: 404, headers: CORS_HEADERS });
  }
  if (!(await verifyRedemptionSession({ session, shop }))) {
    return json({ error: "Invalid, expired, or ineligible StudyPerks session" }, { status: 403, headers: CORS_HEADERS });
  }

  try {
    const code = await claimCode(shop);
    return json({ code }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error(`discount-code claim error for ${shop}:`, err);
    return json({ error: "Could not issue a discount code" }, { status: 500, headers: CORS_HEADERS });
  }
}
