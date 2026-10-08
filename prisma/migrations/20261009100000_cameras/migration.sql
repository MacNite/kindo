-- AlterEnum
ALTER TYPE "ConnectionKind" ADD VALUE 'frigate';

-- CreateTable
CREATE TABLE "DoorbellRing" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoorbellRing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalkLease" (
    "cameraId" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalkLease_pkey" PRIMARY KEY ("cameraId")
);

-- CreateIndex
CREATE INDEX "DoorbellRing_cameraId_at_idx" ON "DoorbellRing"("cameraId", "at");
