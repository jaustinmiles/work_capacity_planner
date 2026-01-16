/**
 * Amendment validation with retry loop
 * Validates AI-generated amendments and retries with error feedback
 */

import { validateAmendments, formatValidationErrors, ValidationResult } from './schema-generator'
import {
  Amendment,
  RawAmendment,
  RawTimeLog,
  RawDeadlineChange,
  RawWorkPatternModification,
  RawWorkSessionEdit,
  TimeLog,
  DeadlineChange,
  WorkPatternModification,
  WorkSessionEdit,
} from './amendment-types'
import { AmendmentType } from './enums'
import { safeParseDateString } from './time-utils'
import { toLocalDate, toLocalTime, getCurrentLocalDate, getCurrentLocalTime } from './datetime-types'
import { logger } from '../logger'

export interface ValidationLoopOptions {
  maxAttempts?: number  // Default: 5
  onRetry?: (attempt: number, errors: string) => void
  onValidationError?: (errors: string) => void
}

export interface ValidationLoopResult {
  success: boolean
  amendments?: Amendment[]
  errors?: string
  attempts: number
  validationResults: ValidationResult[]
}

/**
 * Parse AI response and extract amendments
 * Handles both pure JSON arrays and mixed text + JSON responses
 */
export function parseAIResponse(response: string): { amendments: unknown; rawText?: string } {
  // Try to parse as pure JSON first
  try {
    const parsed = JSON.parse(response)
    return { amendments: parsed }
  } catch (e) {
    // Not pure JSON, try to extract JSON from text
    logger.system.debug('AI response is not pure JSON, attempting extraction', {
      responsePreview: response.substring(0, 100),
      error: e instanceof Error ? e.message : String(e),
    }, 'ai-parse-fallback')
  }

  // Look for JSON array in the response
  const jsonArrayMatch = response.match(/\[[\s\S]*\]/)
  if (jsonArrayMatch) {
    try {
      const amendments = JSON.parse(jsonArrayMatch[0])
      const rawText = response.replace(jsonArrayMatch[0], '').trim()
      if (rawText) {
        return { amendments, rawText }
      }
      return { amendments }
    } catch (e) {
      logger.system.debug('Failed to parse JSON array extracted from response', {
        extractedJson: jsonArrayMatch[0].substring(0, 200),
        error: e instanceof Error ? e.message : String(e),
      }, 'ai-parse-array-failed')
    }
  }

  // Look for JSON code block
  const codeBlockMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const amendments = JSON.parse(codeBlockMatch[1])
      const rawText = response.replace(codeBlockMatch[0], '').trim()
      if (rawText) {
        return { amendments, rawText }
      }
      return { amendments }
    } catch (e) {
      logger.system.debug('Failed to parse JSON from code block', {
        codeBlockContent: (codeBlockMatch[1] ?? '').substring(0, 200),
        error: e instanceof Error ? e.message : String(e),
      }, 'ai-parse-codeblock-failed')
    }
  }

  // No valid JSON found
  return { amendments: null }
}

/**
 * Validation loop with retry logic
 * Validates amendments and provides feedback for AI to retry
 *
 * @param generateAmendments - Function that generates amendments (calls AI)
 * @param options - Configuration options
 * @returns Validation result with amendments or errors
 */
export async function validateWithRetry(
  generateAmendments: (retryFeedback?: string) => Promise<string>,
  options: ValidationLoopOptions = {},
): Promise<ValidationLoopResult> {
  const maxAttempts = options.maxAttempts ?? 5
  const validationResults: ValidationResult[] = []
  let lastErrors = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Generate amendments (with retry feedback if not first attempt)
      const retryFeedback = attempt > 1 ? lastErrors : undefined
      const aiResponse = await generateAmendments(retryFeedback)

      // DEBUG: Log raw AI response before parsing
      logger.system.info('Raw AI response received', {
        attempt,
        responseLength: aiResponse.length,
        responsePreview: aiResponse.substring(0, 2000),
      }, 'ai-raw-response')

      // Parse AI response
      const { amendments } = parseAIResponse(aiResponse)

      // DEBUG: Log parsed amendments before validation
      logger.system.info('Parsed amendments before validation', {
        attempt,
        amendmentCount: Array.isArray(amendments) ? amendments.length : 0,
        amendmentsPreview: JSON.stringify(amendments, null, 2).substring(0, 3000),
      }, 'ai-parsed-amendments')

      if (!amendments) {
        lastErrors = `Failed to parse JSON from AI response. Please provide a valid JSON array of amendments.\n\nReceived:\n${aiResponse.substring(0, 500)}`
        validationResults.push({
          valid: false,
          errors: [{ path: 'root', message: 'Failed to parse JSON from response' }],
        })

        if (options.onRetry && attempt < maxAttempts) {
          options.onRetry(attempt, lastErrors)
        }
        continue
      }

      // Validate amendments
      const validationResult = validateAmendments(amendments)
      validationResults.push(validationResult)

      if (validationResult.valid) {
        // Success! Cast is safe here because:
        // 1. `amendments` starts as `unknown` after JSON.parse()
        // 2. validateAmendments() performs exhaustive runtime validation of the structure
        // 3. When valid === true, we've confirmed it matches the Amendment[] schema
        // This cast bridges the gap between runtime validation and TypeScript's static typing.
        return {
          success: true,
          amendments: amendments as Amendment[],
          attempts: attempt,
          validationResults,
        }
      }

      // Validation failed, format errors for retry
      lastErrors = formatValidationErrors(validationResult)

      if (options.onRetry && attempt < maxAttempts) {
        options.onRetry(attempt, lastErrors)
      }
    } catch (error) {
      lastErrors = `Error during validation attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`
      validationResults.push({
        valid: false,
        errors: [{ path: 'root', message: lastErrors }],
      })

      if (options.onRetry && attempt < maxAttempts) {
        options.onRetry(attempt, lastErrors)
      }
    }
  }

  // All attempts exhausted
  if (options.onValidationError) {
    options.onValidationError(lastErrors)
  }

  return {
    success: false,
    errors: lastErrors,
    attempts: maxAttempts,
    validationResults,
  }
}

/**
 * Create a detailed error report for the user
 * This is shown when all retry attempts are exhausted
 */
export function createUserErrorReport(result: ValidationLoopResult): string {
  let report = `Failed to generate valid amendments after ${result.attempts} attempts.\n\n`

  if (result.validationResults.length > 0) {
    const lastValidation = result.validationResults[result.validationResults.length - 1]
    if (!lastValidation) return report // Satisfy noUncheckedIndexedAccess

    if (lastValidation.errors.length > 0) {
      report += 'The following issues were found:\n\n'

      // Group errors by type
      const errorsByPath = new Map<string, string[]>()

      lastValidation.errors.forEach((error) => {
        const pathParts = error.path.split('.')
        const mainPath = pathParts.slice(0, 2).join('.')

        if (!errorsByPath.has(mainPath)) {
          errorsByPath.set(mainPath, [])
        }

        errorsByPath.get(mainPath)!.push(error.message)
      })

      // Format errors by group
      for (const [path, messages] of errorsByPath.entries()) {
        report += `• ${path}:\n`
        messages.forEach((msg) => {
          report += `  - ${msg}\n`
        })
      }

      // Add suggestions
      report += '\n**Suggestions:**\n'
      report += '• Provide more specific information about what you want to change\n'
      report += '• Ensure all task and workflow names are spelled correctly\n'
      report += '• Break down complex changes into smaller, individual requests\n'
    }
  }

  if (result.errors) {
    report += `\n**Last Error:**\n${result.errors}\n`
  }

  return report
}

// ============================================================================
// TRANSFORMATION FUNCTIONS
// Convert RawAmendment (string dates from AI) to Amendment (proper typed values)
// Uses toLocalDate/toLocalTime for schedule data (fixes timezone bug)
// Uses safeParseDateString for absolute timestamps (TimeLog, DeadlineChange)
// ============================================================================

/**
 * Safe wrapper for toLocalTime that falls back to current time on error
 */
function safeToLocalTime(input: string): import('./datetime-types').LocalTime {
  try {
    return toLocalTime(input)
  } catch (e) {
    logger.system.warn('Invalid time format, using current time', {
      rawTime: input,
      error: e instanceof Error ? e.message : String(e),
    }, 'time-parse-fallback')
    return getCurrentLocalTime()
  }
}

/**
 * Transform a single raw amendment to a proper Amendment with typed values
 */
function transformAmendment(raw: RawAmendment): Amendment {
  switch (raw.type) {
    case AmendmentType.TimeLog: {
      const rawTimeLog = raw as RawTimeLog
      const transformed: TimeLog = {
        ...rawTimeLog,
        date: safeParseDateString(rawTimeLog.date),
        startTime: safeParseDateString(rawTimeLog.startTime),
        endTime: safeParseDateString(rawTimeLog.endTime),
      }
      return transformed
    }

    case AmendmentType.DeadlineChange: {
      const rawDeadline = raw as RawDeadlineChange
      const newDeadline = safeParseDateString(rawDeadline.newDeadline)
      if (!newDeadline) {
        logger.system.warn('DeadlineChange has invalid deadline, using current date', {
          rawDeadline: rawDeadline.newDeadline,
        }, 'deadline-fallback')
      }
      const transformed: DeadlineChange = {
        ...rawDeadline,
        newDeadline: newDeadline || new Date(),
      }
      return transformed
    }

    case AmendmentType.WorkPatternModification: {
      const rawPattern = raw as RawWorkPatternModification

      // Transform date - use toLocalDate which extracts YYYY-MM-DD from ISO strings
      // This is the KEY FIX: we treat the date portion as local, not UTC
      let date = getCurrentLocalDate()
      try {
        date = toLocalDate(rawPattern.date)
      } catch (e) {
        logger.system.warn('WorkPatternModification has invalid date, using current date', {
          rawDate: rawPattern.date,
          error: e instanceof Error ? e.message : String(e),
        }, 'work-pattern-date-fallback')
      }

      // Transform blockData times - toLocalTime extracts HH:MM as local time
      const blockData = rawPattern.blockData ? {
        ...rawPattern.blockData,
        startTime: safeToLocalTime(rawPattern.blockData.startTime),
        endTime: safeToLocalTime(rawPattern.blockData.endTime),
      } : undefined

      // Transform meetingData times
      const meetingData = rawPattern.meetingData ? {
        ...rawPattern.meetingData,
        startTime: safeToLocalTime(rawPattern.meetingData.startTime),
        endTime: safeToLocalTime(rawPattern.meetingData.endTime),
      } : undefined

      const transformed: WorkPatternModification = {
        ...rawPattern,
        date,
        blockData,
        meetingData,
      }
      return transformed
    }

    case AmendmentType.WorkSessionEdit: {
      const rawSession = raw as RawWorkSessionEdit
      const transformed: WorkSessionEdit = {
        ...rawSession,
        startTime: safeParseDateString(rawSession.startTime),
        endTime: safeParseDateString(rawSession.endTime),
      }
      return transformed
    }

    // Types without date fields pass through unchanged
    default:
      return raw as Amendment
  }
}

/**
 * Transform an array of raw amendments to proper Amendment objects
 * This is the main entry point for the transformation pipeline:
 *
 * Flow: AI Response (text) → parseAIResponse() → RawAmendment[] → transformAmendments() → Amendment[]
 *
 * @param rawAmendments - Array of raw amendments from AI (with string dates)
 * @returns Array of transformed amendments (with Date objects)
 */
export function transformAmendments(rawAmendments: RawAmendment[]): Amendment[] {
  return rawAmendments.map(transformAmendment)
}

/**
 * Validate a single amendment (useful for real-time validation in UI)
 */
export { validateAmendment } from './schema-generator'

/**
 * Export validation functions for testing
 */
export { validateAmendments, formatValidationErrors } from './schema-generator'
