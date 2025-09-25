/*
  Warnings:

  - You are about to alter the column `splitRatio` on the `WorkBlock` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patternId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "totalCapacity" INTEGER NOT NULL DEFAULT 0,
    "splitRatio" JSONB,
    CONSTRAINT "WorkBlock_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkBlock" ("endTime", "id", "patternId", "splitRatio", "startTime", "totalCapacity", "type") SELECT "endTime", "id", "patternId", "splitRatio", "startTime", "totalCapacity", "type" FROM "WorkBlock";
DROP TABLE "WorkBlock";
ALTER TABLE "new_WorkBlock" RENAME TO "WorkBlock";
CREATE INDEX "WorkBlock_patternId_idx" ON "WorkBlock"("patternId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
