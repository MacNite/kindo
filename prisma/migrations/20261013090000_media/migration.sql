-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConnectionKind" ADD VALUE 'jellyfin';
ALTER TYPE "ConnectionKind" ADD VALUE 'audiobookshelf';

-- CreateTable
CREATE TABLE "MediaAccount" (
    "connectionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "secret" TEXT NOT NULL,

    CONSTRAINT "MediaAccount_pkey" PRIMARY KEY ("connectionId","memberId")
);

-- CreateIndex
CREATE INDEX "MediaAccount_memberId_idx" ON "MediaAccount"("memberId");

-- AddForeignKey
ALTER TABLE "MediaAccount" ADD CONSTRAINT "MediaAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAccount" ADD CONSTRAINT "MediaAccount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

