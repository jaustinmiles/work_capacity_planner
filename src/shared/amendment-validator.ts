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

      // Parse AI response
      const { amendments } = parseAIResponse(aiResponse)

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
// Convert RawAmendment (string dates from AI) to Amendment (proper Date objects)
// ============================================================================

/**
 * Safely parse a date string to Date object
 * Returns undefined if parsing fails
 *
 * IMPORTANT: For ISO strings with 'Z' timezone suffix, we extract the date/time
 * components directly WITHOUT timezone conversion. This is because the AI sends
 * times that represent the user's intended LOCAL time encoded in ISO format.
 * Using `new Date(isoString)` would interpret Z as UTC and shift the time.
 */
function safeParseDateString(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined
  try {
    // For ISO strings, extract components directly to avoid timezone conversion
    // Match: "2025-12-09" or "2025-12-09T15:21:00Z" or "2025-12-09T15:21:00.000Z"
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/)
    if (isoMatch) {
      const [, year, month, day, hours, minutes, seconds] = isoMatch
      // Create date using LOCAL timezone (not UTC interpretation)
      // Use || '0' for optional time components that might be undefined
      const date = new Date(
        parseInt(year || '0'),
        parseInt(month || '1') - 1,  // Month is 0-indexed
        parseInt(day || '1'),
        parseInt(hours || '0'),
        parseInt(minutes || '0'),
        parseInt(seconds || '0'),
      )
      if (isNaN(date.getTime())) {
        logger.system.debug('Failed to parse ISO date string', { dateStr }, 'date-parse-failed')
        return undefined
      }
      return date
    }

    // Fallback for other date formats (non-ISO)
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
      logger.system.debug('Failed to parse date string', { dateStr }, 'date-parse-failed')
      return undefined
    }
    return date
  } catch (e) {
    logger.system.debug('Exception parsing date string', {
      dateStr,
      error: e instanceof Error ? e.message : String(e),
    }, 'date-parse-exception')
    return undefined
  }
}

/**
 * Transform a single raw amendment to a proper Amendment with Date objects
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
      const date = safeParseDateString(rawPattern.date)
      if (!date) {
        logger.system.warn('WorkPatternModification has invalid date, using current date', {
          rawDate: rawPattern.date,
        }, 'work-pattern-date-fallback')
      }
      const transformed: WorkPatternModification = {
        ...rawPattern,
        date: date || new Date(),
        blockData: rawPattern.blockData ? {
          ...rawPattern.blockData,
          startTime: safeParseDateString(rawPattern.blockData.startTime) || new Date(),
          endTime: safeParseDateString(rawPattern.blockData.endTime) || new Date(),
        } : undefined,
        meetingData: rawPattern.meetingData ? {
          ...rawPattern.meetingData,
          startTime: safeParseDateString(rawPattern.meetingData.startTime) || new Date(),
          endTime: safeParseDateString(rawPattern.meetingData.endTime) || new Date(),
        } : undefined,
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
