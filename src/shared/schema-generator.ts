/**
 * Schema validation for AI amendments
 * Clean implementation using proper TypeScript types and enums
 */

import {
  AmendmentType,
  EntityType,
  TaskStatus,
  WorkPatternOperation,
  WorkSessionOperation,
} from './amendment-types'
import { isValidEnumValue } from './enums'
import { detectDependencyCycles } from './graph-utils'
import { logger } from '../logger'

export interface ValidationError {
  path: string
  message: string
  expected?: string
  received?: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings?: string[]
}

/**
 * Type guard to check if value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate that a value is a valid enum member
 */
function validateEnumValue<T extends Record<string, string>>(
  value: unknown,
  enumObj: T,
  path: string,
  errors: ValidationError[],
): value is T[keyof T] {
  if (typeof value !== 'string' || !isValidEnumValue(enumObj, value)) {
    const validValues = Object.values(enumObj).join(' | ')
    errors.push({
      path,
      message: 'Invalid enum value',
      expected: validValues,
      received: String(value),
    })
    return false
  }
  return true
}

/**
 * Validate AmendmentTarget structure
 */
function validateTarget(target: unknown, path: string, errors: ValidationError[]): boolean {
  if (!isObject(target)) {
    errors.push({ path, message: 'Target must be an object', received: typeof target })
    return false
  }

  let valid = true

  if (!validateEnumValue(target.type, EntityType, `${path}.type`, errors)) {
    valid = false
  }

  if (typeof target.name !== 'string' || target.name.trim().length === 0) {
    errors.push({ path: `${path}.name`, message: 'Target name must be a non-empty string' })
    valid = false
  }

  if (typeof target.confidence !== 'number' || target.confidence < 0 || target.confidence > 1) {
    errors.push({
      path: `${path}.confidence`,
      message: 'Confidence must be a number between 0 and 1',
      received: String(target.confidence),
    })
    valid = false
  }

  return valid
}

/**
 * Validate number within range
 */
function validateNumberRange(
  value: unknown,
  min: number,
  max: number,
  path: string,
  fieldName: string,
  errors: ValidationError[],
): boolean {
  if (typeof value !== 'number' || value < min || value > max) {
    errors.push({
      path,
      message: `${fieldName} must be between ${min} and ${max}`,
      received: String(value),
    })
    return false
  }
  return true
}

/**
 * Validate positive number
 */
function validatePositiveNumber(value: unknown, path: string, fieldName: string, errors: ValidationError[]): boolean {
  if (typeof value !== 'number' || value < 1) {
    errors.push({
      path,
      message: `${fieldName} must be a positive number`,
      received: String(value),
    })
    return false
  }
  return true
}

/**
 * Validate non-empty string
 */
function validateNonEmptyString(value: unknown, path: string, fieldName: string, errors: ValidationError[]): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push({
      path,
      message: `${fieldName} must be a non-empty string`,
    })
    return false
  }
  return true
}

/**
 * Validate date (accepts Date object or ISO string)
 * JSON can only contain strings, so we must accept ISO date strings from AI
 */
function validateDate(value: unknown, path: string, fieldName: string, errors: ValidationError[]): boolean {
  if (value instanceof Date) {
    return true
  }

  if (typeof value === 'string') {
    const date = new Date(value)
    if (isNaN(date.getTime())) {
      errors.push({
        path,
        message: `${fieldName} must be a valid ISO date string or Date object`,
        received: value,
      })
      return false
    }
    return true
  }

  errors.push({
    path,
    message: `${fieldName} must be a Date object or ISO date string`,
    received: typeof value,
  })
  return false
}

/**
 * Main validation function for amendments
 */
export function validateAmendment(amendment: unknown): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: string[] = []

  if (!isObject(amendment)) {
    return {
      valid: false,
      errors: [{ path: 'root', message: 'Amendment must be an object', received: typeof amendment }],
    }
  }

  if (!validateEnumValue(amendment.type, AmendmentType, 'type', errors)) {
    return { valid: false, errors }
  }

  const type = amendment.type as AmendmentType

  switch (type) {
    case AmendmentType.StatusUpdate:
      validateStatusUpdate(amendment, errors)
      break
    case AmendmentType.TimeLog:
      validateTimeLog(amendment, errors)
      break
    case AmendmentType.NoteAddition:
      validateNoteAddition(amendment, errors)
      break
    case AmendmentType.DurationChange:
      validateDurationChange(amendment, errors)
      break
    case AmendmentType.StepAddition:
      validateStepAddition(amendment, errors)
      break
    case AmendmentType.StepRemoval:
      validateStepRemoval(amendment, errors)
      break
    case AmendmentType.DependencyChange:
      validateDependencyChange(amendment, errors)
      break
    case AmendmentType.TaskCreation:
      validateTaskCreation(amendment, errors)
      break
    case AmendmentType.WorkflowCreation:
      validateWorkflowCreation(amendment, errors, warnings)
      break
    case AmendmentType.DeadlineChange:
      validateDeadlineChange(amendment, errors)
      break
    case AmendmentType.PriorityChange:
      validatePriorityChange(amendment, errors)
      break
    case AmendmentType.TypeChange:
      validateTypeChange(amendment, errors)
      break
    case AmendmentType.WorkPatternModification:
      validateWorkPatternModification(amendment, errors)
      break
    case AmendmentType.WorkSessionEdit:
      validateWorkSessionEdit(amendment, errors)
      break
    case AmendmentType.ArchiveToggle:
      validateArchiveToggle(amendment, errors)
      break
    case AmendmentType.QueryResponse:
      validateQueryResponse(amendment, errors)
      break
  }

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
  }

  if (warnings.length > 0) {
    result.warnings = warnings
  }

  return result
}

// Individual validator functions

function validateStatusUpdate(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)
  validateEnumValue(a.newStatus, TaskStatus, 'newStatus', errors)
}

function validateTimeLog(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)

  // Date is required for time logging - must know WHICH DAY the time was spent
  if (!a.date) {
    errors.push({
      path: 'date',
      message: 'Date is required for time logging (ISO date string, e.g., "2025-01-24")',
      received: 'undefined',
    })
  } else {
    validateDate(a.date, 'date', 'Date', errors)
  }

  // startTime is required - must know when the work session started
  if (!a.startTime) {
    errors.push({
      path: 'startTime',
      message: 'Start time is required for time logging (ISO datetime string, e.g., "2025-01-24T09:00:00")',
      received: 'undefined',
    })
  } else {
    validateDate(a.startTime, 'startTime', 'Start time', errors)
  }

  // endTime is required - duration is calculated from start/end times
  if (!a.endTime) {
    errors.push({
      path: 'endTime',
      message: 'End time is required for time logging (ISO datetime string, e.g., "2025-01-24T10:30:00")',
      received: 'undefined',
    })
  } else {
    validateDate(a.endTime, 'endTime', 'End time', errors)
  }

  // Duration is now optional - calculated from times if not provided
  // But if provided, must be valid
  if (a.duration !== undefined && (typeof a.duration !== 'number' || a.duration < 0)) {
    errors.push({
      path: 'duration',
      message: 'Duration must be a non-negative number (minutes). Can be omitted - will be calculated from start/end times.',
      received: String(a.duration),
    })
  }
}

function validateNoteAddition(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)
  validateNonEmptyString(a.note, 'note', 'Note', errors)

  if (typeof a.append !== 'boolean') {
    errors.push({
      path: 'append',
      message: 'Append must be a boolean',
      received: String(a.append),
    })
  }
}

function validateDurationChange(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)
  validatePositiveNumber(a.newDuration, 'newDuration', 'New duration', errors)
}

function validateStepAddition(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.workflowTarget, 'workflowTarget', errors)
  validateNonEmptyString(a.stepName, 'stepName', 'Step name', errors)
  validatePositiveNumber(a.duration, 'duration', 'Duration', errors)
  // stepType is a user-defined task type ID (string) - no enum validation needed
  validateNonEmptyString(a.stepType, 'stepType', 'Step type', errors)
}

function validateStepRemoval(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.workflowTarget, 'workflowTarget', errors)
  validateNonEmptyString(a.stepName, 'stepName', 'Step name', errors)
}

function validateDependencyChange(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)
  validateNonEmptyString(a.stepName, 'stepName', 'Step name', errors)
}

function validateTaskCreation(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateNonEmptyString(a.name, 'name', 'Task name', errors)
  validatePositiveNumber(a.duration, 'duration', 'Duration', errors)

  if (a.importance !== undefined) {
    validateNumberRange(a.importance, 1, 10, 'importance', 'Importance', errors)
  }

  if (a.urgency !== undefined) {
    validateNumberRange(a.urgency, 1, 10, 'urgency', 'Urgency', errors)
  }

  if (a.taskType !== undefined) {
    // taskType is a user-defined task type ID (string)
    validateNonEmptyString(a.taskType, 'taskType', 'Task type', errors)
  }
}

function validateWorkflowCreation(
  a: Record<string, unknown>,
  errors: ValidationError[],
  warnings: string[],
): void {
  validateNonEmptyString(a.name, 'name', 'Workflow name', errors)

  if (!Array.isArray(a.steps) || a.steps.length === 0) {
    errors.push({
      path: 'steps',
      message: 'Steps must be a non-empty array',
    })
    return
  }

  const stepNames = new Set<string>()

  a.steps.forEach((step: unknown, index: number) => {
    if (!isObject(step)) {
      errors.push({
        path: `steps[${index}]`,
        message: 'Step must be an object',
      })
      return
    }

    validateNonEmptyString(step.name, `steps[${index}].name`, 'Step name', errors)
    validatePositiveNumber(step.duration, `steps[${index}].duration`, 'Duration', errors)
    // step.type is a user-defined task type ID (string)
    validateNonEmptyString(step.type, `steps[${index}].type`, 'Step type', errors)

    if (typeof step.name === 'string') {
      if (stepNames.has(step.name)) {
        errors.push({
          path: `steps[${index}].name`,
          message: `Duplicate step name: ${step.name}`,
        })
      }
      stepNames.add(step.name)
    }
  })

  // Check for circular dependencies
  if (errors.length === 0 && Array.isArray(a.steps)) {
    const circular = detectCircularDependencies(a.steps as Array<Record<string, unknown>>)
    if (circular.length > 0) {
      warnings.push(`Potential circular dependencies: ${circular.join(', ')}`)
    }
  }

  if (a.importance !== undefined) {
    validateNumberRange(a.importance, 1, 10, 'importance', 'Importance', errors)
  }

  if (a.urgency !== undefined) {
    validateNumberRange(a.urgency, 1, 10, 'urgency', 'Urgency', errors)
  }
}

function detectCircularDependencies(steps: Array<Record<string, unknown>>): string[] {
  // Build a dependency graph from step names
  const graph = new Map<string, string[]>()

  steps.forEach((step) => {
    if (typeof step.name === 'string') {
      const deps = Array.isArray(step.dependsOn) ? (step.dependsOn as string[]) : []
      graph.set(step.name, deps)
    }
  })

  // Use centralized cycle detection from graph-utils
  const result = detectDependencyCycles(graph)

  // Format cycles as readable strings (e.g., "A -> B -> C -> A")
  return result.cycles.map(cycle => cycle.join(' -> '))
}

function validateDeadlineChange(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)

  if (a.newDeadline) {
    validateDate(a.newDeadline, 'newDeadline', 'New deadline', errors)
  } else {
    errors.push({
      path: 'newDeadline',
      message: 'New deadline is required',
    })
  }
}

function validatePriorityChange(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)

  if (a.importance !== undefined) {
    validateNumberRange(a.importance, 1, 10, 'importance', 'Importance', errors)
  }

  if (a.urgency !== undefined) {
    validateNumberRange(a.urgency, 1, 10, 'urgency', 'Urgency', errors)
  }

  if (a.cognitiveComplexity !== undefined) {
    validateNumberRange(a.cognitiveComplexity, 1, 5, 'cognitiveComplexity', 'Cognitive complexity', errors)
  }
}

function validateTypeChange(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)
  // newType is a user-defined task type ID (string)
  validateNonEmptyString(a.newType, 'newType', 'New type', errors)
}

function validateWorkPatternModification(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateDate(a.date, 'date', 'Date', errors)
  validateEnumValue(a.operation, WorkPatternOperation, 'operation', errors)

  // Validate blockData if present
  if (a.blockData && isObject(a.blockData)) {
    const block = a.blockData

    // DEBUG: Log blockData details before validation
    logger.system.debug('Validating blockData', {
      operation: a.operation,
      blockDataKeys: Object.keys(block),
      typeField: block.type,
      typeofType: typeof block.type,
      blockDataPreview: JSON.stringify(block).substring(0, 500),
    }, 'blockdata-validation')

    validateDate(block.startTime, 'blockData.startTime', 'Start time', errors)
    validateDate(block.endTime, 'blockData.endTime', 'End time', errors)

    // blockData.type is required for ALL operations including remove_block
    // This allows the UI to display which type of block is being removed for user confirmation
    validateNonEmptyString(block.type, 'blockData.type', 'Block type', errors)
  }

  // Validate meetingData if present
  if (a.meetingData && isObject(a.meetingData)) {
    const meeting = a.meetingData
    validateNonEmptyString(meeting.name, 'meetingData.name', 'Meeting name', errors)
    validateDate(meeting.startTime, 'meetingData.startTime', 'Start time', errors)
    validateDate(meeting.endTime, 'meetingData.endTime', 'End time', errors)
    // meeting.type is a string (meeting type category)
    validateNonEmptyString(meeting.type, 'meetingData.type', 'Meeting type', errors)
  }
}

function validateWorkSessionEdit(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateEnumValue(a.operation, WorkSessionOperation, 'operation', errors)

  if (a.operation === WorkSessionOperation.Split && !Array.isArray(a.splitSessions)) {
    errors.push({
      path: 'splitSessions',
      message: 'Split operation requires splitSessions array',
    })
  }

  // Validate date fields if present
  if (a.startTime !== undefined) {
    validateDate(a.startTime, 'startTime', 'Start time', errors)
  }

  if (a.endTime !== undefined) {
    validateDate(a.endTime, 'endTime', 'End time', errors)
  }
}

function validateArchiveToggle(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateTarget(a.target, 'target', errors)

  if (typeof a.archive !== 'boolean') {
    errors.push({
      path: 'archive',
      message: 'Archive must be a boolean',
      received: String(a.archive),
    })
  }
}

function validateQueryResponse(a: Record<string, unknown>, errors: ValidationError[]): void {
  validateNonEmptyString(a.query, 'query', 'Query', errors)
  validateNonEmptyString(a.response, 'response', 'Response', errors)
}

/**
 * Validate array of amendments
 */
export function validateAmendments(amendments: unknown): ValidationResult {
  if (!Array.isArray(amendments)) {
    return {
      valid: false,
      errors: [{ path: 'root', message: 'Amendments must be an array', received: typeof amendments }],
    }
  }

  const allErrors: ValidationError[] = []
  const allWarnings: string[] = []

  amendments.forEach((amendment, index) => {
    const result = validateAmendment(amendment)
    if (!result.valid) {
      result.errors.forEach((error) => {
        allErrors.push({
          ...error,
          path: `amendments[${index}].${error.path}`,
        })
      })
    }
    if (result.warnings) {
      result.warnings.forEach((warning) => {
        allWarnings.push(`amendments[${index}]: ${warning}`)
      })
    }
  })

  const result: ValidationResult = {
    valid: allErrors.length === 0,
    errors: allErrors,
  }

  if (allWarnings.length > 0) {
    result.warnings = allWarnings
  }

  return result
}

/**
 * Get schema hint for a specific error path to help AI fix the issue
 */
function getSchemaHint(path: string): string {
  const hints: Record<string, string> = {
    // NoteAddition
    'append': '   → SCHEMA: note_addition requires "append": true|false (boolean)\n',

    // StepAddition/StepRemoval
    'workflowTarget': '   → SCHEMA: step_addition/step_removal uses "workflowTarget" NOT "target": { "type": "workflow", "name": "...", "confidence": 0.9 }\n',
    'stepName': '   → SCHEMA: Step operations require "stepName": "step name string"\n',
    'stepType': '   → SCHEMA: step_addition requires "stepType": user-defined task type ID (see Available Task Types in context)\n',

    // DurationChange
    'newDuration': '   → SCHEMA: duration_change requires "newDuration": positive number (minutes)\n',

    // TimeLog - requires date, startTime, and endTime
    'date': '   → SCHEMA: time_log requires "date": ISO date string (e.g., "2025-01-24")\n',
    'startTime': '   → SCHEMA: time_log requires "startTime": ISO datetime (e.g., "2025-01-24T09:00:00")\n',
    'endTime': '   → SCHEMA: time_log requires "endTime": ISO datetime (e.g., "2025-01-24T10:30:00"). Duration is calculated from times.\n',
    'duration': '   → SCHEMA: time_log "duration" is optional (calculated from times); step_addition requires "duration": positive number\n',

    // ArchiveToggle
    'archive': '   → SCHEMA: archive_toggle requires "archive": true|false (boolean)\n',

    // Target object
    'target.type': '   → SCHEMA: target.type must be "task" | "workflow" | "step"\n',
    'target.name': '   → SCHEMA: target.name must be a non-empty string\n',
    'target.confidence': '   → SCHEMA: target.confidence must be a number between 0.0 and 1.0\n',

    // WorkPatternModification
    'operation': '   → SCHEMA: operation must be "add_block" | "add_meeting" | "remove_block" | "remove_meeting" for work_pattern_modification, or "create" | "update" | "delete" for work_session_edit\n',
    'blockData.type': '   → SCHEMA: blockData.type must be a user-defined task type ID (see Available Task Types in context)\n',

    // DeadlineChange
    'newDeadline': '   → SCHEMA: deadline_change requires "newDeadline": ISO date string (e.g., "2025-11-30T17:00:00Z")\n',

    // TypeChange
    'newType': '   → SCHEMA: type_change requires "newType": user-defined task type ID (see Available Task Types in context)\n',

    // WorkflowCreation steps
    'steps': '   → SCHEMA: workflow_creation requires "steps": array of { name, duration, type, dependsOn?, asyncWaitTime? }\n',
    'steps[': '   → SCHEMA: Each step needs: "name" (string), "duration" (positive number), "type" (user-defined task type ID)\n',
  }

  // Check for matches in the path
  for (const [key, hint] of Object.entries(hints)) {
    if (path.includes(key)) {
      return hint
    }
  }
  return ''
}

/**
 * Format validation errors for AI re-prompting
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return 'All amendments are valid.'
  }

  let message = 'VALIDATION ERRORS - You must fix these and regenerate the COMPLETE JSON array:\n\n'

  result.errors.forEach((error, index) => {
    message += `${index + 1}. ${error.path}: ${error.message}`
    if (error.expected) {
      message += ` (expected: ${error.expected})`
    }
    if (error.received) {
      message += ` (received: ${error.received})`
    }
    message += '\n'

    // Add schema hint to help AI fix the specific error
    const hint = getSchemaHint(error.path)
    if (hint) {
      message += hint
    }
  })

  if (result.warnings && result.warnings.length > 0) {
    message += '\nWarnings:\n'
    result.warnings.forEach((warning, index) => {
      message += `${index + 1}. ${warning}\n`
    })
  }

  message += '\nRespond with the CORRECTED JSON array only. No explanations.'

  return message
}
