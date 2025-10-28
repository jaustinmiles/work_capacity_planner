/**
 * Extracts patterns from log entries for duplicate detection and filtering
 */

import { LogEntry } from '../types'

export class PatternExtractor {
  /**
   * Extract a pattern key from a log entry that ignores dynamic values
   * This is the KEY to making the ignore feature work!
   */
  static extractPattern(entry: LogEntry): string {
    // Primary key is [scope][component][tag]
    const { scope, component, tag } = entry.context
    const baseKey = `${scope}:${component}:${tag || 'default'}`

    // For finer control, also include normalized message
    const normalizedMessage = this.normalizeMessage(entry.message)

    return `${baseKey}:${normalizedMessage}`
  }

  /**
   * Normalize a message by removing dynamic values
   */
  private static normalizeMessage(message: string): string {
    let normalized = message

    // Remove timestamps (ISO format)
    normalized = normalized.replace(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/g,
      '<timestamp>',
    )

    // Remove UUIDs
    normalized = normalized.replace(
      /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
      '<uuid>',
    )

    // Remove hex IDs (like 0x7f8b9c0d1e2f)
    normalized = normalized.replace(
      /0x[a-f0-9]+/gi,
      '<hex>',
    )

    // Remove file paths (keep just the filename)
    normalized = normalized.replace(
      /([\\/][\w\-.]+)+\.(tsx?|jsx?|json|css|scss)/g,
      (match) => {
        const parts = match.split(/[\\/]/)
        return parts[parts.length - 1] || match // Keep just filename
      },
    )

    // Remove numbers that look like IDs (5+ digits)
    normalized = normalized.replace(
      /\b\d{5,}\b/g,
      '<id>',
    )

    // Remove durations (like 123ms, 1.5s)
    normalized = normalized.replace(
      /\b\d+(\.\d+)?(ms|s|m|h)\b/g,
      '<duration>',
    )

    // Remove memory sizes (like 1024KB, 2.5MB)
    normalized = normalized.replace(
      /\b\d+(\.\d+)?(KB|MB|GB|TB|B)\b/gi,
      '<size>',
    )

    // Remove array indices and counts
    normalized = normalized.replace(
      /\[\d+\]/g,
      '[<index>]',
    )

    // Remove common numeric values in parentheses
    normalized = normalized.replace(
      /\(\d+\)/g,
      '(<count>)',
    )

    // Normalize line numbers (file.ts:123 -> file.ts:<line>)
    normalized = normalized.replace(
      /:\d+:\d+/g,
      ':<line>:<col>',
    )

    return normalized
  }

  /**
   * Get a human-readable pattern description
   */
  static getPatternDescription(pattern: string): string {
    const parts = pattern.split(':')
    if (parts.length < 3) return pattern

    const [scope, component, tag, ...messageParts] = parts
    const message = messageParts.join(':')

    let description = `[${scope}] ${component}`
    if (tag !== 'default') {
      description += ` (${tag})`
    }
    if (message && message.length < 50) {
      description += `: ${message}`
    }

    return description
  }
}
