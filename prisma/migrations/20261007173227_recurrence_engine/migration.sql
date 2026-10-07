-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "afternoonUntil" TEXT NOT NULL DEFAULT '17:00',
ADD COLUMN     "dayStartsAt" TEXT NOT NULL DEFAULT '03:00',
ADD COLUMN     "holidayIcsUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "holidaysError" TEXT,
ADD COLUMN     "holidaysSyncedAt" TIMESTAMP(3),
ADD COLUMN     "morningUntil" TEXT NOT NULL DEFAULT '11:00';

-- CreateTable
CREATE TABLE "HolidayRange" (
    "id" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "feed" TEXT NOT NULL,

    CONSTRAINT "HolidayRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HolidayRange_end_idx" ON "HolidayRange"("end");
