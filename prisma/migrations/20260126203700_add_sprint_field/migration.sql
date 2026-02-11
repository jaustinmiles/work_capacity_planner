-- Migration manually marked as applied (drift resolution)
-- This migration added inActiveSprint column to Task table
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "inActiveSprint" BOOLEAN NOT NULL DEFAULT false;
