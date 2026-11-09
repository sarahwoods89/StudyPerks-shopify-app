import crypto from "node:crypto";

export function verifySavingsSignature({ timestamp, signature, rawBody, secret, now = Date.now() }) {
  const timestampMs = Number(timestamp) * 1000;
  if (!secret || secret.length < 32 || !/^\d+$/.test(timestamp) || !Number.isFinite(timestampMs)
    || Math.abs(now - timestampMs) > 5 * 60 * 1000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}

export function aggregateSavings(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const current = grouped.get(row.currencyCode) || { currencyCode: row.currencyCode, totalSaved: 0, totalSpent: 0, orderCount: 0 };
    current.totalSaved += row.discountAmount; current.totalSpent += row.orderTotal; current.orderCount += 1;
    grouped.set(row.currencyCode, current);
  }
  const money = (value) => Math.round((value + 1e-9) * 100) / 100;
  return [...grouped.values()].map((item) => ({ ...item, totalSaved: money(item.totalSaved), totalSpent: money(item.totalSpent) }));
}
