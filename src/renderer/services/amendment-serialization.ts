/**
 * Amendment JSON serialization utilities
 *
 * Centralizes JSON serialization/deserialization for amendments with proper error handling.
 * Used when storing amendments in the database as JSON strings.
 */

import { logger } from '@/logger'

/**
 * Serialize amendments array to JSON string for database storage
 *
 * @param amendments - Array of amendments to serialize
 * @returns JSON string or undefined if serialization fails or input is empty
 */
export function amendmentsToJSON(amendments: unknown[] | undefined): string | undefined {
  if (!amendments || amendments.length === 0) return undefined

  try {
    return JSON.stringify(amendments)
  } catch (error) {
    logger.ui.error('Failed to serialize amendments to JSON', {
      error: error instanceof Error ? error.message : String(error),
      amendmentCount: amendments.length,
    }, 'amendment-serialization-failed')
    return undefined
  }
}

/**
 * Deserialize amendments JSON string from database
 *
 * @param jsonStr - JSON string from database
 * @returns Parsed amendments array or null if parsing fails
 */
export function amendmentsFromJSON(jsonStr: string | null | undefined): unknown[] | null {
  if (!jsonStr) return null

  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) {
      logger.ui.warn('Amendments JSON is not an array', {
        type: typeof parsed,
      }, 'amendment-parse-not-array')
      return null
    }
    return parsed
  } catch (error) {
    logger.ui.error('Failed to parse amendments JSON', {
      error: error instanceof Error ? error.message : String(error),
      jsonPreview: jsonStr.substring(0, 100),
    }, 'amendment-parse-failed')
    return null
  }
}

/**
 * Convenience object for importing both functions together
 */
export const amendmentSerialization = {
  toJSON: amendmentsToJSON,
  fromJSON: amendmentsFromJSON,
}
