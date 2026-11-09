CREATE TABLE IF NOT EXISTS "StudentDiscountClaim" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "identityHash" TEXT NOT NULL,
  "activeCode" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentDiscountClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentDiscountClaim_shop_identityHash_key"
  ON "StudentDiscountClaim"("shop", "identityHash");
CREATE INDEX IF NOT EXISTS "StudentDiscountClaim_shop_activeCode_idx"
  ON "StudentDiscountClaim"("shop", "activeCode");
ALTER TABLE "AffiliateTransaction" ADD COLUMN IF NOT EXISTS "identityHash" TEXT;
ALTER TABLE "AffiliateTransaction" ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION;
ALTER TABLE "AffiliateTransaction" ADD COLUMN IF NOT EXISTS "currencyCode" TEXT;
CREATE INDEX IF NOT EXISTS "AffiliateTransaction_identityHash_currencyCode_idx"
  ON "AffiliateTransaction"("identityHash", "currencyCode");
