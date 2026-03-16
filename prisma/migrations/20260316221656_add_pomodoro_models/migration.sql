-- AlterTable
ALTER TABLE "public"."WorkSession" ADD COLUMN     "pomodoroCycleId" TEXT;

-- CreateTable
CREATE TABLE "public"."PomodoroSettings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workDurationMinutes" INTEGER NOT NULL DEFAULT 25,
    "shortBreakMinutes" INTEGER NOT NULL DEFAULT 5,
    "longBreakMinutes" INTEGER NOT NULL DEFAULT 15,
    "cyclesBeforeLongBreak" INTEGER NOT NULL DEFAULT 4,
    "autoStartBreak" BOOLEAN NOT NULL DEFAULT true,
    "autoStartWork" BOOLEAN NOT NULL DEFAULT false,
    "idleReminderMinutes" INTEGER,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PomodoroSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PomodoroCycle" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'work',
    "workDurationMinutes" INTEGER NOT NULL,
    "breakDurationMinutes" INTEGER NOT NULL,
    "phaseStartTime" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "breakTimeSinkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PomodoroCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PomodoroSettings_sessionId_key" ON "public"."PomodoroSettings"("sessionId");

-- CreateIndex
CREATE INDEX "PomodoroCycle_sessionId_idx" ON "public"."PomodoroCycle"("sessionId");

-- CreateIndex
CREATE INDEX "PomodoroCycle_startTime_idx" ON "public"."PomodoroCycle"("startTime");

-- CreateIndex
CREATE INDEX "PomodoroCycle_status_idx" ON "public"."PomodoroCycle"("status");

-- CreateIndex
CREATE INDEX "WorkSession_pomodoroCycleId_idx" ON "public"."WorkSession"("pomodoroCycleId");

-- AddForeignKey
ALTER TABLE "public"."WorkSession" ADD CONSTRAINT "WorkSession_pomodoroCycleId_fkey" FOREIGN KEY ("pomodoroCycleId") REFERENCES "public"."PomodoroCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PomodoroSettings" ADD CONSTRAINT "PomodoroSettings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PomodoroCycle" ADD CONSTRAINT "PomodoroCycle_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
