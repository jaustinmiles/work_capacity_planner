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
  asyncWaitTime: number // minutes
  dependencies: string[] // task IDs
  completed: boolean
  completedAt?: Date
  deadline?: Date // hard deadline for task
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
