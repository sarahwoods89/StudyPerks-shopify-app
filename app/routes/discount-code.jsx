import { json } from "@remix-run/node";
import db from "../db.server";
import { claimCode } from "../lib/discountCodes.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Independently re-confirms eligibility with studyperks.me — never trust that
// a caller already verified client-side, since anyone can call this endpoint
// directly, skipping the widget entirely. See 2026-08-04 security fix.
async function verifyEligibility({ wallet, email }) {
  try {
    if (wallet) {
      const res = await fetch("https://www.studyperks.me/api/check-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      const data = await res.json();
      return !!data.eligible;
    }
    if (email) {
      const res = await fetch("https://www.studyperks.me/api/check-token-by-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return !!data.eligible;
    }
  } catch (err) {
    console.error("Eligibility re-check failed:", err);
  }
  return false;
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

  let shop, wallet, email;
  try {
    const body = await request.json();
    shop = body?.shop;
    wallet = body?.wallet;
    email = body?.email;
  } catch {
    return json({ error: "Invalid request body" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!shop || typeof shop !== "string" || !shop.endsWith(".myshopify.com")) {
    return json({ error: "Missing or invalid shop" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!wallet && !email) {
    return json({ error: "Missing wallet or email for verification" }, { status: 400, headers: CORS_HEADERS });
  }

  const config = await db.discountConfig.findUnique({ where: { shop } });
  if (!config) {
    return json({ error: "StudyPerks is not configured for this shop" }, { status: 404, headers: CORS_HEADERS });
  }

  const eligible = await verifyEligibility({ wallet, email });
  if (!eligible) {
    return json({ error: "Not eligible" }, { status: 403, headers: CORS_HEADERS });
  }

  try {
    const code = await claimCode(shop);
    return json({ code }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error(`discount-code claim error for ${shop}:`, err);
    return json({ error: "Could not issue a discount code" }, { status: 500, headers: CORS_HEADERS });
  }
}
