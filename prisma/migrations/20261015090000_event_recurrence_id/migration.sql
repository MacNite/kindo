-- Which occurrence of a recurring series an event is, so Kindo can change one occurrence,
-- this and following, or the whole series at its calendar (D70). Filled by the next sync.
ALTER TABLE "Event" ADD COLUMN "recurrenceId" TIMESTAMP(3),
ADD COLUMN "seriesId" TEXT;

-- Read every connected calendar again on its next sync, unchanged or not, so the new columns fill.
UPDATE "CalendarSource" SET "syncState" = NULL WHERE "connectionId" IS NOT NULL;
