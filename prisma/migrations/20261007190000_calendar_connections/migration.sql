-- CreateEnum
CREATE TYPE "ConnectionKind" AS ENUM ('caldav', 'google', 'ics', 'immich', 'homeassistant');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ok', 'error', 'pending');

-- AlterTable
ALTER TABLE "CalendarSource" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "remoteId" TEXT,
ADD COLUMN     "syncState" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "etag" TEXT,
ADD COLUMN     "href" TEXT,
ADD COLUMN     "recurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "uid" TEXT;

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "kind" "ConnectionKind" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT,
    "secret" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

