-- CreateTable
CREATE TABLE "WorkPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patternId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "focusCapacity" INTEGER,
    "adminCapacity" INTEGER,
    CONSTRAINT "WorkBlock_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkMeeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patternId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recurring" TEXT NOT NULL DEFAULT 'none',
    "daysOfWeek" TEXT,
    CONSTRAINT "WorkMeeting_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patternId" TEXT NOT NULL,
    "taskId" TEXT,
    "sequencedTaskId" TEXT,
    "stepId" TEXT,
    "type" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "plannedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkSession_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkPattern_date_key" ON "WorkPattern"("date");

-- CreateIndex
CREATE INDEX "WorkBlock_patternId_idx" ON "WorkBlock"("patternId");

-- CreateIndex
CREATE INDEX "WorkMeeting_patternId_idx" ON "WorkMeeting"("patternId");

-- CreateIndex
CREATE INDEX "WorkSession_patternId_idx" ON "WorkSession"("patternId");

-- CreateIndex
CREATE INDEX "WorkSession_taskId_idx" ON "WorkSession"("taskId");

-- CreateIndex
CREATE INDEX "WorkSession_startTime_idx" ON "WorkSession"("startTime");
