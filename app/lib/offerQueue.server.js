import db from "../db.server.js";
import { fetchConfirmedOffer, offerFingerprint } from "./offerSnapshot.server.js";
import { syncOfferToStudyPerks } from "./offerSync.server.js";

export async function enqueueOfferSync(shop, client = db, { force = false } = {}) {
  return client.offerSyncState.upsert({
    where: { shop },
    create: { shop },
    update: { revision: { increment: 1 }, pending: true, attempts: 0, nextAttemptAt: new Date(),
      ...(force ? { lastFingerprint: null } : {}) },
  });
}

export async function deliverOffer(shop) {
  const job = await db.offerSyncState.findUnique({ where: { shop } });
  const now = new Date();
  if (!job?.pending || job.nextAttemptAt > now) return { pending: Boolean(job?.pending) };
  const leaseUntil = new Date(Date.now() + 120000);
  const claimed = await db.offerSyncState.updateMany({
    where: { shop, revision: job.revision, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil },
  });
  if (!claimed.count) return { pending: true };
  try {
    const config = await db.discountConfig.findUnique({ where: { shop } });
    if (!config?.discountId) throw new Error("Merchant discount ID needs reconciliation");
    const offer = await fetchConfirmedOffer(config);
    const fingerprint = offerFingerprint(offer);
    // Update local values only from a successful Shopify read, without
    // overwriting a concurrent merchant save or advertising unsupported scope.
    if (offer.status !== "DELETED" && offer.restrictions?.catalogueSupported) {
      await db.discountConfig.updateMany({
        where: { shop, discountId: config.discountId, updatedAt: config.updatedAt },
        data: { discountName: offer.discountName, discountType: offer.discountType,
          discountValue: offer.discountValue, discountCollections: offer.collectionIds },
      });
    }
    if (fingerprint !== job.lastFingerprint) await syncOfferToStudyPerks(offer);
    // Recheck scheduled offers periodically: clock-driven activation/expiry
    // must propagate even if Shopify does not emit a new edit webhook.
    const scheduled = Boolean((offer.status === "ACTIVE" && offer.endsAt) || offer.status === "SCHEDULED");
    await db.offerSyncState.updateMany({
      where: { shop, revision: job.revision },
      data: { pending: scheduled, nextAttemptAt: new Date(Date.now() + 300000),
        lastFingerprint: fingerprint, lastSyncedAt: new Date(), attempts: 0, lastError: null },
    });
    return { pending: false, active: offer.active, status: offer.status };
  } catch {
    // Do not put tokens, raw API responses or request bodies in logs/status.
    await db.offerSyncState.updateMany({
      where: { shop, revision: job.revision },
      data: { attempts: { increment: 1 }, lastError: "Offer sync failed; automatic retry scheduled",
        nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7))) },
    });
    return { pending: true };
  } finally {
    await db.offerSyncState.updateMany({ where: { shop, leaseUntil }, data: { leaseUntil: null } });
  }
}

let running = false;
async function drain() {
  if (running || !process.env.STUDYPERKS_OFFER_SYNC_SECRET) return;
  running = true;
  try {
    const jobs = await db.offerSyncState.findMany({
      where: { pending: true, nextAttemptAt: { lte: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
      orderBy: { nextAttemptAt: "asc" }, take: 5,
    });
    for (const job of jobs) await deliverOffer(job.shop);
  } catch {
    console.error("Offer sync worker unavailable; will retry");
  } finally { running = false; }
}

export function startOfferSyncWorker() {
  if (process.env.NODE_ENV !== "production" || global.studyperksOfferWorker) return;
  global.studyperksOfferWorker = setInterval(drain, 15000);
  global.studyperksOfferWorker.unref();
}
