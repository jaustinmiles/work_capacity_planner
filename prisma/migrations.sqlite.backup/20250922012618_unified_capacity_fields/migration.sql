/*
  Warnings:

  - You are about to drop the column `adminCapacity` on the `WorkBlock` table. All the data in the column will be lost.
  - You are about to drop the column `capacity` on the `WorkBlock` table. All the data in the column will be lost.
  - You are about to drop the column `focusCapacity` on the `WorkBlock` table. All the data in the column will be lost.

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
    "splitRatio" TEXT,
    CONSTRAINT "WorkBlock_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkBlock" ("endTime", "id", "patternId", "startTime", "type") SELECT "endTime", "id", "patternId", "startTime", "type" FROM "WorkBlock";
DROP TABLE "WorkBlock";
ALTER TABLE "new_WorkBlock" RENAME TO "WorkBlock";
CREATE INDEX "WorkBlock_patternId_idx" ON "WorkBlock"("patternId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
