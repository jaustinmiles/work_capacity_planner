/**
 * Amendment validation with retry loop
 * Validates AI-generated amendments and retries with error feedback
 */

import { validateAmendments, formatValidationErrors, ValidationResult } from './schema-generator'
import { Amendment } from './amendment-types'

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
  } catch (_e) {
    // Not pure JSON, try to extract JSON from text
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
    } catch (_e) {
      // Failed to parse extracted JSON
    }
  }

  // Look for JSON code block
  const codeBlockMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/)
  if (codeBlockMatch) {
    try {
      const amendments = JSON.parse(codeBlockMatch[1])
      const rawText = response.replace(codeBlockMatch[0], '').trim()
      if (rawText) {
        return { amendments, rawText }
      }
      return { amendments }
    } catch (_e) {
      // Failed to parse code block JSON
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
        // Success!
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

/**
 * Validate a single amendment (useful for real-time validation in UI)
 */
export { validateAmendment } from './schema-generator'

/**
 * Export validation functions for testing
 */
export { validateAmendments, formatValidationErrors } from './schema-generator'
