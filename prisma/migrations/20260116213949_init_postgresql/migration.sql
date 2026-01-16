-- CreateTable
CREATE TABLE "public"."ContextEntry" (
    "id" TEXT NOT NULL,
    "jobContextId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailySchedule" (
    "id" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "DailySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JargonEntry" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "category" TEXT,
    "examples" TEXT,
    "relatedTerms" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JargonEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobContext" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "asyncPatterns" TEXT NOT NULL,
    "reviewCycles" TEXT NOT NULL,
    "tools" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Meeting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "scheduleId" TEXT NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduledTask" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledMinutes" INTEGER NOT NULL,
    "isPartial" BOOLEAN NOT NULL,
    "isStart" BOOLEAN NOT NULL,
    "isEnd" BOOLEAN NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SequencedTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "dependencies" TEXT NOT NULL DEFAULT '[]',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "totalDuration" INTEGER NOT NULL,
    "criticalPathDuration" INTEGER NOT NULL,
    "worstCaseDuration" INTEGER NOT NULL,
    "overallStatus" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT,
    "deadline" TIMESTAMP(3),
    "deadlineType" TEXT,

    CONSTRAINT "SequencedTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduleSnapshot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "label" TEXT,
    "snapshotData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserTaskType" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTaskType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TimeSink" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "typeId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeSink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TimeSinkSession" (
    "id" TEXT NOT NULL,
    "timeSinkId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "actualMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeSinkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "importance" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'work',
    "asyncWaitTime" INTEGER NOT NULL DEFAULT 0,
    "dependencies" TEXT NOT NULL DEFAULT '[]',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "actualDuration" INTEGER,
    "notes" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT,
    "deadline" TIMESTAMP(3),
    "deadlineType" TEXT,
    "cognitiveComplexity" INTEGER,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedStartTime" TIMESTAMP(3),
    "hasSteps" BOOLEAN NOT NULL DEFAULT false,
    "currentStepId" TEXT,
    "overallStatus" TEXT NOT NULL DEFAULT 'not_started',
    "criticalPathDuration" INTEGER NOT NULL DEFAULT 0,
    "worstCaseDuration" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskStep" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "asyncWaitTime" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sequencedTaskId" TEXT,
    "stepIndex" INTEGER NOT NULL,
    "taskId" TEXT NOT NULL,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "actualDuration" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "cognitiveComplexity" INTEGER,
    "isAsyncTrigger" BOOLEAN NOT NULL DEFAULT false,
    "expectedResponseTime" INTEGER,
    "importance" INTEGER,
    "urgency" INTEGER,

    CONSTRAINT "TaskStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TimeEstimateAccuracy" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "workflowCategory" TEXT,
    "estimatedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEstimateAccuracy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkBlock" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "typeConfig" TEXT NOT NULL DEFAULT '{"kind":"system","systemType":"blocked"}',
    "totalCapacity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkMeeting" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recurring" TEXT NOT NULL DEFAULT 'none',
    "daysOfWeek" TEXT,

    CONSTRAINT "WorkMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkPattern" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateName" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkSession" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stepId" TEXT,
    "patternId" TEXT,
    "blockId" TEXT,
    "type" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "actualMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductivityPattern" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timeRangeStart" TEXT NOT NULL,
    "timeRangeEnd" TEXT NOT NULL,
    "cognitiveCapacity" TEXT NOT NULL,
    "preferredComplexity" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductivityPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchedulingPreferences" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "allowWeekendWork" BOOLEAN NOT NULL DEFAULT false,
    "weekendPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "contextSwitchPenalty" INTEGER NOT NULL DEFAULT 15,
    "asyncParallelizationBonus" INTEGER NOT NULL DEFAULT 20,
    "bedtimeHour" INTEGER NOT NULL DEFAULT 22,
    "wakeTimeHour" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulingPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ErrorLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "error" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LogMetric" (
    "id" TEXT NOT NULL,
    "processType" TEXT NOT NULL,
    "memoryUsage" TEXT NOT NULL,
    "cpuUsage" DOUBLE PRECISION NOT NULL,
    "logCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Conversation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jobContextId" TEXT,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "amendments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContextEntry_jobContextId_key_key" ON "public"."ContextEntry"("jobContextId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DailySchedule_dayOfWeek_key" ON "public"."DailySchedule"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "JargonEntry_sessionId_term_key" ON "public"."JargonEntry"("sessionId", "term");

-- CreateIndex
CREATE INDEX "ScheduleSnapshot_sessionId_idx" ON "public"."ScheduleSnapshot"("sessionId");

-- CreateIndex
CREATE INDEX "ScheduleSnapshot_createdAt_idx" ON "public"."ScheduleSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "UserTaskType_sessionId_idx" ON "public"."UserTaskType"("sessionId");

-- CreateIndex
CREATE INDEX "TimeSink_sessionId_idx" ON "public"."TimeSink"("sessionId");

-- CreateIndex
CREATE INDEX "TimeSinkSession_timeSinkId_idx" ON "public"."TimeSinkSession"("timeSinkId");

-- CreateIndex
CREATE INDEX "TimeSinkSession_startTime_idx" ON "public"."TimeSinkSession"("startTime");

-- CreateIndex
CREATE INDEX "TimeEstimateAccuracy_taskType_idx" ON "public"."TimeEstimateAccuracy"("taskType");

-- CreateIndex
CREATE INDEX "TimeEstimateAccuracy_sessionId_idx" ON "public"."TimeEstimateAccuracy"("sessionId");

-- CreateIndex
CREATE INDEX "WorkBlock_patternId_idx" ON "public"."WorkBlock"("patternId");

-- CreateIndex
CREATE INDEX "WorkMeeting_patternId_idx" ON "public"."WorkMeeting"("patternId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPattern_sessionId_date_key" ON "public"."WorkPattern"("sessionId", "date");

-- CreateIndex
CREATE INDEX "WorkSession_startTime_idx" ON "public"."WorkSession"("startTime");

-- CreateIndex
CREATE INDEX "WorkSession_taskId_idx" ON "public"."WorkSession"("taskId");

-- CreateIndex
CREATE INDEX "WorkSession_blockId_idx" ON "public"."WorkSession"("blockId");

-- CreateIndex
CREATE INDEX "ProductivityPattern_sessionId_idx" ON "public"."ProductivityPattern"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingPreferences_sessionId_key" ON "public"."SchedulingPreferences"("sessionId");

-- CreateIndex
CREATE INDEX "ErrorLog_level_idx" ON "public"."ErrorLog"("level");

-- CreateIndex
CREATE INDEX "ErrorLog_sessionId_idx" ON "public"."ErrorLog"("sessionId");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "public"."ErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "LogMetric_processType_idx" ON "public"."LogMetric"("processType");

-- CreateIndex
CREATE INDEX "LogMetric_createdAt_idx" ON "public"."LogMetric"("createdAt");

-- CreateIndex
CREATE INDEX "AppLog_createdAt_idx" ON "public"."AppLog"("createdAt");

-- CreateIndex
CREATE INDEX "AppLog_level_idx" ON "public"."AppLog"("level");

-- CreateIndex
CREATE INDEX "AppLog_source_idx" ON "public"."AppLog"("source");

-- CreateIndex
CREATE INDEX "Conversation_sessionId_idx" ON "public"."Conversation"("sessionId");

-- CreateIndex
CREATE INDEX "Conversation_createdAt_idx" ON "public"."Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_idx" ON "public"."ChatMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "public"."ChatMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."ContextEntry" ADD CONSTRAINT "ContextEntry_jobContextId_fkey" FOREIGN KEY ("jobContextId") REFERENCES "public"."JobContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JargonEntry" ADD CONSTRAINT "JargonEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JobContext" ADD CONSTRAINT "JobContext_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Meeting" ADD CONSTRAINT "Meeting_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."DailySchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScheduledTask" ADD CONSTRAINT "ScheduledTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SequencedTask" ADD CONSTRAINT "SequencedTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ScheduleSnapshot" ADD CONSTRAINT "ScheduleSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserTaskType" ADD CONSTRAINT "UserTaskType_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimeSink" ADD CONSTRAINT "TimeSink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimeSinkSession" ADD CONSTRAINT "TimeSinkSession_timeSinkId_fkey" FOREIGN KEY ("timeSinkId") REFERENCES "public"."TimeSink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."TaskStep" ADD CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskStep" ADD CONSTRAINT "TaskStep_sequencedTaskId_fkey" FOREIGN KEY ("sequencedTaskId") REFERENCES "public"."SequencedTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimeEstimateAccuracy" ADD CONSTRAINT "TimeEstimateAccuracy_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkBlock" ADD CONSTRAINT "WorkBlock_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "public"."WorkPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkMeeting" ADD CONSTRAINT "WorkMeeting_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "public"."WorkPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkPattern" ADD CONSTRAINT "WorkPattern_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkSession" ADD CONSTRAINT "WorkSession_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "public"."WorkPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkSession" ADD CONSTRAINT "WorkSession_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "public"."WorkBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkSession" ADD CONSTRAINT "WorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductivityPattern" ADD CONSTRAINT "ProductivityPattern_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchedulingPreferences" ADD CONSTRAINT "SchedulingPreferences_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_jobContextId_fkey" FOREIGN KEY ("jobContextId") REFERENCES "public"."JobContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
