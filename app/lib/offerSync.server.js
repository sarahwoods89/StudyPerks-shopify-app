import crypto from "node:crypto";

export async function syncOfferToStudyPerks(offer) {
  const secret = process.env.STUDYPERKS_OFFER_SYNC_SECRET;
  const endpoint = process.env.STUDYPERKS_OFFER_SYNC_URL
    || "https://www.studyperks.me/internal/shopify/offers";
  if (!secret || secret.length < 32) {
    throw new Error("STUDYPERKS_OFFER_SYNC_SECRET is not configured.");
  }

  const body = JSON.stringify(offer);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-StudyPerks-Timestamp": timestamp,
      "X-StudyPerks-Signature": signature,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`StudyPerks offer sync returned HTTP ${response.status}.`);
  }
}
