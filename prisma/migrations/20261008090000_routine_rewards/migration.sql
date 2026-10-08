-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "routineRewards" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "routinePoints" INTEGER NOT NULL DEFAULT 5;

-- One routine per member, period and rhythm (D43): steps of duplicates move
-- into the earliest routine, after its own steps, in their old order. Step ids
-- stay, so the completion history keeps pointing at them.
CREATE TEMP TABLE "_routine_keeper" AS
SELECT "id",
       first_value("id") OVER (PARTITION BY "memberId", "period", "recurrence" ORDER BY "sortOrder", "createdAt", "id") AS "keeper",
       "sortOrder", "createdAt"
FROM "Routine";

UPDATE "RoutineStep" s
SET "routineId" = m."keeper", "position" = m."pos"
FROM (
  SELECT s."id", k."keeper",
         (row_number() OVER (PARTITION BY k."keeper" ORDER BY (k."id" <> k."keeper"), k."sortOrder", k."createdAt", k."id", s."position") - 1)::int AS "pos"
  FROM "RoutineStep" s
  JOIN "_routine_keeper" k ON k."id" = s."routineId"
) m
WHERE s."id" = m."id";

DELETE FROM "Routine" WHERE "id" IN (SELECT "id" FROM "_routine_keeper" WHERE "id" <> "keeper");
DROP TABLE "_routine_keeper";
