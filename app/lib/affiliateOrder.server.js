import db from "../db.server.js";
const UNIQUE_CODE = /^SP-[A-Z0-9]+$/i;
const LEGACY_CODE = "STUDYPERKS";
const finiteNumber = (value) => { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; };
export function findStudyPerksCode(payload) {
  const codes = Array.isArray(payload?.discount_codes) ? payload.discount_codes : [];
  const unique = codes.find((entry) => typeof entry?.code === "string" && UNIQUE_CODE.test(entry.code.trim()));
  if (unique) return { code: unique.code.trim(), entry: unique, unique: true };
  const legacy = codes.find((entry) => typeof entry?.code === "string" && entry.code.trim().toUpperCase() === LEGACY_CODE);
  return legacy ? { code: LEGACY_CODE, entry: legacy, unique: false } : null;
}
export function extractOrderValues(payload, previousDiscountAmount = null) {
  const discount = findStudyPerksCode(payload); if (!discount) return null;
  const orderId = String(payload?.id || payload?.admin_graphql_api_id || "");
  const orderTotal = finiteNumber(payload.current_total_price ?? payload.total_price);
  const currencyCode = typeof payload.currency === "string" ? payload.currency.trim().toUpperCase() : null;
  if (!orderId || orderTotal === null || !currencyCode) return null;
  const specificAmount = finiteNumber(discount.entry.amount);
  return { orderId, orderTotal, currencyCode, discountAmount: specificAmount !== null ? specificAmount : previousDiscountAmount, ...discount };
}
export async function recordAffiliateOrder(shop, payload, { requirePaid = false } = {}) {
  if (requirePaid && payload?.financial_status && String(payload.financial_status).toLowerCase() !== "paid") return { recorded: false, reason: "not_paid" };
  const initial = extractOrderValues(payload); if (!initial) return { recorded: false, reason: "unrelated_or_malformed" };
  const existing = await db.affiliateTransaction.findUnique({ where: { shop_orderId: { shop, orderId: initial.orderId } } });
  const values = extractOrderValues(payload, existing?.discountAmount ?? null); if (!values) return { recorded: false, reason: "unrelated_or_malformed" };
  let identityHash = existing?.identityHash ?? null;
  if (values.unique) {
    const issued = await db.studentDiscountCode.findUnique({ where: { shop_code: { shop, code: values.code } } });
    const claim = issued ? await db.studentDiscountClaim.findFirst({ where: { shop, activeCode: issued.code } }) : null;
    if (!issued || !claim?.identityHash) { console.warn(`StudyPerks order attribution unavailable for ${shop}; code mapping not found`); return { recorded: false, reason: "missing_claim" }; }
    identityHash = claim.identityHash;
  }
  await db.$transaction(async (tx) => {
    await tx.affiliateTransaction.upsert({ where: { shop_orderId: { shop, orderId: values.orderId } },
      update: { orderTotal: values.orderTotal, discountCode: values.code, identityHash, ...(values.discountAmount !== null ? { discountAmount: values.discountAmount } : {}), currencyCode: values.currencyCode },
      create: { shop, orderId: values.orderId, orderTotal: values.orderTotal, discountCode: values.code, identityHash, discountAmount: values.discountAmount, currencyCode: values.currencyCode } });
    if (values.unique) await tx.studentDiscountCode.updateMany({ where: { shop, code: values.code }, data: { redeemedOrderId: values.orderId } });
  });
  return { recorded: true, attributed: Boolean(identityHash), orderId: values.orderId };
}
