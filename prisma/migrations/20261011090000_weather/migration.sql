-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "weather" JSONB,
ADD COLUMN     "weatherAt" TIMESTAMP(3),
ADD COLUMN     "weatherError" TEXT,
ADD COLUMN     "weatherFailedAt" TIMESTAMP(3),
ADD COLUMN     "weatherFailures" INTEGER NOT NULL DEFAULT 0;
