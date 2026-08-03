import { json } from "@remix-run/node";
import db from "../db.server";
import { claimCode } from "../lib/discountCodes.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

  let shop;
  try {
    const body = await request.json();
    shop = body?.shop;
  } catch {
    return json({ error: "Invalid request body" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!shop || typeof shop !== "string" || !shop.endsWith(".myshopify.com")) {
    return json({ error: "Missing or invalid shop" }, { status: 400, headers: CORS_HEADERS });
  }

  const config = await db.discountConfig.findUnique({ where: { shop } });
  if (!config) {
    return json({ error: "StudyPerks is not configured for this shop" }, { status: 404, headers: CORS_HEADERS });
  }

  try {
    const code = await claimCode(shop);
    return json({ code }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error(`discount-code claim error for ${shop}:`, err);
    return json({ error: "Could not issue a discount code" }, { status: 500, headers: CORS_HEADERS });
  }
}
