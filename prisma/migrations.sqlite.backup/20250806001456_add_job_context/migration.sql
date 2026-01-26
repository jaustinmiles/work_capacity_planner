-- CreateTable
CREATE TABLE "JobContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "asyncPatterns" TEXT NOT NULL,
    "reviewCycles" TEXT NOT NULL,
    "tools" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContextEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobContextId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContextEntry_jobContextId_fkey" FOREIGN KEY ("jobContextId") REFERENCES "JobContext" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContextEntry_jobContextId_key_key" ON "ContextEntry"("jobContextId", "key");
