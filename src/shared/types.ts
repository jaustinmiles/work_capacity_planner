export interface Session {
  id: string
  name: string
  description?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: string
  name: string
  duration: number // minutes
  importance: number // 1-10
  urgency: number // 1-10
  type: 'focused' | 'admin'
  category?: 'work' | 'personal' // defaults to 'work'
  asyncWaitTime: number // minutes
  dependencies: string[] // task IDs
  completed: boolean
  completedAt?: Date
  deadline?: Date // deadline for task
  deadlineType?: 'hard' | 'soft' // type of deadline
  cognitiveComplexity?: 1 | 2 | 3 | 4 | 5 // cognitive load rating
  isLocked?: boolean // whether task is locked to specific time
  lockedStartTime?: Date // specific time task must start
  sessionId: string
  createdAt: Date
  updatedAt: Date
  actualDuration?: number // for time tracking
  notes?: string
  projectId?: string // for grouping

  // Workflow support
  hasSteps: boolean
  currentStepId?: string
  overallStatus: 'not_started' | 'in_progress' | 'waiting' | 'completed'
  criticalPathDuration: number
  worstCaseDuration: number
  steps?: TaskStep[] // Optional - populated when needed

  // For async optimization (computed, not stored)
  isAsyncTrigger?: boolean
}

export interface TaskStep {
  id: string
  taskId: string
  name: string
  duration: number
  type: 'focused' | 'admin'
  dependsOn: string[] // step IDs
  asyncWaitTime: number
  status: 'pending' | 'in_progress' | 'waiting' | 'completed' | 'skipped'
  stepIndex: number
  actualDuration?: number
  startedAt?: Date
  completedAt?: Date
  percentComplete: number
  notes?: string
  cognitiveComplexity?: 1 | 2 | 3 | 4 | 5 // cognitive load rating
  isAsyncTrigger?: boolean // marks steps that kick off async work
  expectedResponseTime?: number // expected wait time in minutes
}

export interface DailySchedule {
  id: string
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday'
  startTime: string // "09:00"
  endTime: string // "18:00"
  meetings: Meeting[]
}

export interface Meeting {
  id: string
  name: string
  startTime: string
  endTime: string
  recurring: boolean
}

export interface ScheduledTask {
  taskId: string
  scheduledDate: Date
  scheduledMinutes: number
  isPartial: boolean
  isStart: boolean
  isEnd: boolean
}

export interface Project {
  id: string
  name: string
  color: string
  createdAt: Date
}

export interface TaskFilters {
  completed?: boolean
  type?: 'focused' | 'admin'
  projectId?: string
  search?: string
}

export interface ProductivityPattern {
  id: string
  sessionId: string
  timeRangeStart: string // "09:00"
  timeRangeEnd: string // "12:00"
  cognitiveCapacity: 'peak' | 'high' | 'moderate' | 'low'
  preferredComplexity: number[] // [4, 5] for complex tasks during peak
  createdAt: Date
  updatedAt: Date
}

export interface SchedulingPreferences {
  id: string
  sessionId: string
  allowWeekendWork: boolean
  weekendPenalty: number // 0-1, how much to avoid weekends
  contextSwitchPenalty: number // minutes lost per context switch
  asyncParallelizationBonus: number // priority bonus for async work
  createdAt: Date
  updatedAt: Date
}
