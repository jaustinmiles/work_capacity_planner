-- Migration: add_endeavor_models
-- This migration adds Endeavor and EndeavorItem tables
-- NOTE: This migration is marked as "already applied" because the tables
-- were created via `prisma db push` (which doesn't create migration files)
-- Run: npx prisma migrate resolve --applied 20260211000000_add_endeavor_models

-- CreateTable: Endeavor
-- Higher-level construct to group related workflows and tasks
CREATE TABLE "public"."Endeavor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "importance" INTEGER NOT NULL DEFAULT 5,
    "urgency" INTEGER NOT NULL DEFAULT 5,
    "deadline" TIMESTAMP(3),
    "deadlineType" TEXT,
    "color" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Endeavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EndeavorItem
-- Links tasks/workflows to endeavors with ordering
CREATE TABLE "public"."EndeavorItem" (
    "id" TEXT NOT NULL,
    "endeavorId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EndeavorItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Endeavor indexes
CREATE INDEX "Endeavor_sessionId_idx" ON "public"."Endeavor"("sessionId");
CREATE INDEX "Endeavor_status_idx" ON "public"."Endeavor"("status");

-- CreateIndex: EndeavorItem indexes
CREATE UNIQUE INDEX "EndeavorItem_endeavorId_taskId_key" ON "public"."EndeavorItem"("endeavorId", "taskId");
CREATE INDEX "EndeavorItem_endeavorId_idx" ON "public"."EndeavorItem"("endeavorId");
CREATE INDEX "EndeavorItem_taskId_idx" ON "public"."EndeavorItem"("taskId");

-- AddForeignKey: Endeavor -> Session
ALTER TABLE "public"."Endeavor" ADD CONSTRAINT "Endeavor_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: EndeavorItem -> Endeavor
ALTER TABLE "public"."EndeavorItem" ADD CONSTRAINT "EndeavorItem_endeavorId_fkey" FOREIGN KEY ("endeavorId") REFERENCES "public"."Endeavor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: EndeavorItem -> Task
ALTER TABLE "public"."EndeavorItem" ADD CONSTRAINT "EndeavorItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
