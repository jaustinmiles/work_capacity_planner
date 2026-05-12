/**
 * Combined tRPC Router
 *
 * Aggregates all domain-specific routers into a single app router.
 * This is the main entry point for all API routes.
 */

import { router } from '../trpc'
import { sessionRouter } from './session'
import { taskRouter } from './task'
import { userTaskTypeRouter } from './userTaskType'
import { workPatternRouter } from './workPattern'
import { workSessionRouter } from './workSession'
import { timeSinkRouter } from './timeSink'
import { workflowRouter } from './workflow'
import { jobContextRouter } from './jobContext'
import { jargonRouter } from './jargon'
import { conversationRouter } from './conversation'
import { snapshotRouter } from './snapshot'
import { logRouter } from './log'
import { speechRouter } from './speech'
import { aiRouter } from './ai'
import { endeavorRouter } from './endeavor'
import { deepWorkBoardRouter } from './deepWorkBoard'
import { feedbackRouter } from './feedback'
import { pomodoroRouter } from './pomodoro'
import { agentRouter } from './agent'
import { timerRouter } from './timer'
import { memoryRouter } from './memory'
import { decisionRouter } from './decision'

/**
 * Main application router
 *
 * Structure:
 * - session: Session management (create, list, switch, delete)
 * - task: Task CRUD and completion
 * - userTaskType: Custom task type definitions
 * - workPattern: Work patterns, blocks, and meetings
 * - workSession: Time tracking for tasks
 * - timeSink: Non-task time tracking
 * - workflow: TaskStep operations for workflows
 * - jobContext: Job contexts and entries
 * - jargon: Jargon dictionary
 * - conversation: Chat persistence
 * - snapshot: Schedule snapshots
 * - log: Application logging
 * - speech: Speech-to-text transcription
 * - ai: AI operations (Claude for chat, brainstorm, workflows)
 * - endeavor: Higher-level goal grouping for workflows/tasks
 * - deepWorkBoard: Freeform whiteboard canvas for task creation and execution
 * - feedback: Development feedback (file-based, context/feedback.json)
 * - agent: AI agent tool approval/rejection (chat endpoint is SSE, see agent-chat-handler)
 */
export const appRouter = router({
  session: sessionRouter,
  task: taskRouter,
  userTaskType: userTaskTypeRouter,
  workPattern: workPatternRouter,
  workSession: workSessionRouter,
  timeSink: timeSinkRouter,
  workflow: workflowRouter,
  jobContext: jobContextRouter,
  jargon: jargonRouter,
  conversation: conversationRouter,
  snapshot: snapshotRouter,
  log: logRouter,
  speech: speechRouter,
  ai: aiRouter,
  endeavor: endeavorRouter,
  deepWorkBoard: deepWorkBoardRouter,
  feedback: feedbackRouter,
  pomodoro: pomodoroRouter,
  agent: agentRouter,
  timer: timerRouter,
  memory: memoryRouter,
  decision: decisionRouter,
})

/**
 * Export type definition of the API
 * This is used by the client to get type-safe API access
 */
export type AppRouter = typeof appRouter
