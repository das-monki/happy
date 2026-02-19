-- CreateTable
CREATE TABLE "ServiceAccountQuotaSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "snapshot" BYTEA NOT NULL,
    "status" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "staleAfterMs" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAccountQuotaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAccountQuotaSnapshot_accountId_vendor_key" ON "ServiceAccountQuotaSnapshot"("accountId", "vendor");

-- CreateIndex
CREATE INDEX "ServiceAccountQuotaSnapshot_accountId_idx" ON "ServiceAccountQuotaSnapshot"("accountId");

-- AddForeignKey
ALTER TABLE "ServiceAccountQuotaSnapshot" ADD CONSTRAINT "ServiceAccountQuotaSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
