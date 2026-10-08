-- CreateTable
CREATE TABLE "ContactBirthday" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "show" BOOLEAN NOT NULL DEFAULT false,
    "alias" TEXT,
    "memberId" TEXT,

    CONSTRAINT "ContactBirthday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactBirthday_connectionId_uid_key" ON "ContactBirthday"("connectionId", "uid");

-- AddForeignKey
ALTER TABLE "ContactBirthday" ADD CONSTRAINT "ContactBirthday_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactBirthday" ADD CONSTRAINT "ContactBirthday_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

