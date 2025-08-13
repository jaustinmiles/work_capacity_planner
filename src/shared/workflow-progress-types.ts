/**
 * Types for workflow progress tracking and time management
 */

export interface WorkSession {
  id: string;
  taskStepId: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // minutes
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeEstimateAccuracy {
  id: string;
  sessionId: string;
  taskType: 'focused' | 'admin';
  workflowCategory?: string;
  estimatedMinutes: number;
  actualMinutes: number;
  variance: number; // percentage
  createdAt: Date;
}

export interface WorkflowProgress {
  stepProgress: number; // 0-100
  timeProgress: number; // 0-100
  completedSteps: number;
  totalSteps: number;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  variance: number; // minutes over/under
  status: 'not_started' | 'in_progress' | 'on_track' | 'delayed' | 'completed';
}

export interface StepProgress {
  stepId: string;
  percentComplete: number; // 0-100
  actualDuration?: number;
  workSessions: WorkSession[];
  lastWorkedAt?: Date;
}

export interface TimeAccuracyStats {
  averageVariance: number; // percentage
  totalSamples: number;
  overestimateCount: number;
  underestimateCount: number;
  accurateCount: number; // within 10%
  byTaskType: {
    focused: { variance: number; samples: number };
    admin: { variance: number; samples: number };
  };
  trend: 'improving' | 'stable' | 'worsening';
}

// Voice update types
export interface WorkflowUpdate {
  completedSteps: CompletedStepUpdate[];
  durationUpdates: DurationUpdate[];
  progressUpdates: ProgressUpdate[];
  newSteps: NewStepUpdate[];
  removedSteps: string[];
  dependencyChanges: DependencyUpdate[];
}

export interface CompletedStepUpdate {
  stepId: string;
  actualMinutes?: number;
  notes?: string;
}

export interface DurationUpdate {
  stepId: string;
  newDuration: number;
  reason?: string;
}

export interface ProgressUpdate {
  stepId: string;
  percentComplete: number;
  notes?: string;
}

export interface NewStepUpdate {
  name: string;
  duration: number;
  type: 'focused' | 'admin';
  insertAfter?: string; // step ID
  dependencies?: string[];
}

export interface DependencyUpdate {
  stepId: string;
  action: 'add' | 'remove';
  dependsOn: string;
}

// UI State types
export interface WorkflowEditingState {
  isRecording: boolean;
  transcript: string;
  isProcessing: boolean;
  proposedUpdate?: WorkflowUpdate;
  error?: string;
}

export interface TimeLoggingState {
  stepId: string;
  minutes: number;
  percentComplete: number;
  notes: string;
}

// Validation types
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// Analytics types
export interface WorkflowAnalytics {
  workflowId: string;
  totalWorkflows: number;
  averageCompletionTime: number;
  averageVariance: number;
  successRate: number;
  commonBottlenecks: {
    stepName: string;
    averageDelay: number;
    frequency: number;
  }[];
}

export interface DailyWorkSummary {
  date: string;
  totalMinutesWorked: number;
  focusedMinutes: number;
  adminMinutes: number;
  completedSteps: number;
  workflowsProgressed: string[];
}

// Helper type guards
export function isCompletedStep(step: { status: string }): boolean {
  return step.status === 'completed'
}

export function isActiveWorkSession(session: WorkSession): boolean {
  return !session.endTime
}

export function hasTimeVariance(estimated: number, actual: number, threshold = 0.1): boolean {
  const variance = Math.abs((actual - estimated) / estimated)
  return variance > threshold
}

// Constants
export const TIME_ESTIMATION_THRESHOLDS = {
  ACCURATE: 0.1, // Within 10%
  MODERATE: 0.25, // Within 25%
  POOR: 0.5, // Over 50% variance
} as const

export const WORKFLOW_STATUS_THRESHOLDS = {
  DELAYED: 1.2, // 20% over time
  AT_RISK: 1.1, // 10% over time
  ON_TRACK: 1.0,
} as const
