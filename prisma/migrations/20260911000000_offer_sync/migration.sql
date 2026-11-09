CREATE TABLE IF NOT EXISTS "OfferSyncState" (
  "shop" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "lastFingerprint" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "pending" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OfferSyncState_pending_nextAttemptAt_idx"
  ON "OfferSyncState"("pending", "nextAttemptAt");
