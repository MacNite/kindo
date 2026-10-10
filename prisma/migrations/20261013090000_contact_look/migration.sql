-- AlterTable
ALTER TABLE "ContactBirthday" ADD COLUMN     "color" TEXT,
ADD COLUMN     "photo" BYTEA,
ADD COLUMN     "photoAt" TIMESTAMP(3),
ADD COLUMN     "photoType" TEXT;
