-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SchedulingPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "allowWeekendWork" BOOLEAN NOT NULL DEFAULT false,
    "weekendPenalty" REAL NOT NULL DEFAULT 0.5,
    "contextSwitchPenalty" INTEGER NOT NULL DEFAULT 15,
    "asyncParallelizationBonus" INTEGER NOT NULL DEFAULT 20,
    "bedtimeHour" INTEGER NOT NULL DEFAULT 22,
    "wakeTimeHour" INTEGER NOT NULL DEFAULT 6,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchedulingPreferences_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SchedulingPreferences" ("allowWeekendWork", "asyncParallelizationBonus", "contextSwitchPenalty", "createdAt", "id", "sessionId", "updatedAt", "weekendPenalty") SELECT "allowWeekendWork", "asyncParallelizationBonus", "contextSwitchPenalty", "createdAt", "id", "sessionId", "updatedAt", "weekendPenalty" FROM "SchedulingPreferences";
DROP TABLE "SchedulingPreferences";
ALTER TABLE "new_SchedulingPreferences" RENAME TO "SchedulingPreferences";
CREATE UNIQUE INDEX "SchedulingPreferences_sessionId_key" ON "SchedulingPreferences"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
