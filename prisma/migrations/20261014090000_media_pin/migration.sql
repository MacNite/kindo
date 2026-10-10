-- CreateEnum
CREATE TYPE "MediaPin" AS ENUM ('off', 'speakers', 'all');

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "mediaPin" "MediaPin" NOT NULL DEFAULT 'off';

