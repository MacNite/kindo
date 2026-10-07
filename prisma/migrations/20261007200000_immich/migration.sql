-- AlterTable
ALTER TABLE "PhotoAlbum" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "remoteId" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PhotoAsset" ADD COLUMN     "remoteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAlbum_connectionId_remoteId_key" ON "PhotoAlbum"("connectionId", "remoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAsset_albumId_remoteId_key" ON "PhotoAsset"("albumId", "remoteId");

-- AddForeignKey
ALTER TABLE "PhotoAlbum" ADD CONSTRAINT "PhotoAlbum_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

