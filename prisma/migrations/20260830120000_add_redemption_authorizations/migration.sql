CREATE TABLE "RedemptionFlow" (
    "state" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedemptionFlow_pkey" PRIMARY KEY ("state")
);

CREATE TABLE "RedemptionAuthorization" (
    "jti" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedemptionAuthorization_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "RedemptionFlow_shop_expiresAt_idx" ON "RedemptionFlow"("shop", "expiresAt");
CREATE INDEX "RedemptionAuthorization_shop_consumedAt_idx" ON "RedemptionAuthorization"("shop", "consumedAt");
