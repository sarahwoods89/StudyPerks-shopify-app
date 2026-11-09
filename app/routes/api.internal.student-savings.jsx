import { json } from "@remix-run/node";
import db from "../db.server";
import { verifySavingsSignature, aggregateSavings } from "../lib/studentSavings.server";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const attempts = new Map();
const hashPattern = /^[a-f0-9]{64}$/;

function allowed(request, rawBody) {
  return verifySavingsSignature({ timestamp: request.headers.get("X-StudyPerks-Timestamp") || "",
    signature: request.headers.get("X-StudyPerks-Signature") || "", rawBody,
    secret: process.env.STUDYPERKS_SAVINGS_API_SECRET });
}

export async function action({ request }) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const key = request.headers.get("X-StudyPerks-Caller") || "internal";
  const now = Date.now();
  const record = attempts.get(key);
  if (record && now - record.started < WINDOW_MS && record.count >= MAX_REQUESTS) return json({ error: "Rate limit exceeded" }, { status: 429 });
  if (!record || now - record.started >= WINDOW_MS) attempts.set(key, { started: now, count: 1 }); else record.count += 1;
  let rawBody;
  try { rawBody = await request.text(); } catch { return json({ error: "Invalid request" }, { status: 400 }); }
  let body;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!allowed(request, rawBody)) return json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const identityHash = body?.identityHash;
  if (typeof identityHash !== "string" || !hashPattern.test(identityHash)) return json({ error: "Invalid identity hash" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const rows = await db.affiliateTransaction.findMany({ where: { identityHash, discountAmount: { gt: 0 }, currencyCode: { not: null } }, select: { currencyCode: true, discountAmount: true, orderTotal: true } });
  const currencies = aggregateSavings(rows);
  return json({ currencies }, { headers: { "Cache-Control": "no-store" } });
}

export async function loader() { return new Response(null, { status: 405, headers: { Allow: "POST" } }); }
