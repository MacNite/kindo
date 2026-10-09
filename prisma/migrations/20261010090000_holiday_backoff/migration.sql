-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "holidaysFailedAt" TIMESTAMP(3),
ADD COLUMN     "holidaysFailures" INTEGER NOT NULL DEFAULT 0;
