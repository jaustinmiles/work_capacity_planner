-- AlterTable
ALTER TABLE "public"."SchedulingPreferences" ADD COLUMN     "minimumSplitMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "taskSplittingEnabled" BOOLEAN NOT NULL DEFAULT true;
