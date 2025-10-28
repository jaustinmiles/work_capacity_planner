/**
 * Extracts context information from the call stack
 */

import { LogContext, LogScope } from './types'

export class ContextExtractor {
  /**
   * Extract component name and other context from the call stack
   */
  static extractContext(scope: LogScope, tag?: string): LogContext {
    const error = new Error()
    const stack = error.stack?.split('\n') || []

    // Skip first 3 lines (Error, extractContext, logger method)
    const relevantStack = stack.slice(3)

    let component = 'Unknown'
    let functionName: string | undefined
    let file: string | undefined
    let line: number | undefined

    // Find first non-logger file in stack
    for (const stackLine of relevantStack) {
      // Different browsers have different stack formats
      // Chrome/Edge: "at functionName (file:line:col)"
      // Firefox: "functionName@file:line:col"

      // Skip logger files
      if (stackLine.includes('/logger/') ||
          stackLine.includes('node_modules')) {
        continue
      }

      // Try to parse Chrome/Edge format
      let match = stackLine.match(/at\s+(\S+)?\s*\((.+?):(\d+):(\d+)\)/)
      if (!match) {
        // Try Firefox format
        match = stackLine.match(/(\S+)?@(.+?):(\d+):(\d+)/)
      }

      if (match) {
        const fnName = match[1]?.replace(/^Object\./, '')
        if (fnName) {
          functionName = fnName
        }
        const fullPath = match[2]
        line = match[3] ? parseInt(match[3], 10) : undefined

        // Extract filename from path
        if (fullPath) {
          // Remove webpack/vite prefixes
          const cleanPath = fullPath
            .replace(/^.*\/src\//, 'src/')
            .replace(/\?.*$/, '')  // Remove query strings

          file = cleanPath

          // Extract component name from file path
          const pathParts = cleanPath.split('/')
          const fileName = pathParts[pathParts.length - 1]

          if (fileName) {
            // Remove extension and common suffixes
            component = fileName
              .replace(/\.(tsx?|jsx?)$/, '')
              .replace(/\.(test|spec)$/, '')
              .replace(/\.(modal|component|service|store|hook)$/, '')
          }
        }

        break
      }
    }

    const context: LogContext = {
      scope,
      component,
    }

    // Only add optional properties if they have values
    if (tag) context.tag = tag
    if (functionName) context.function = functionName
    if (file) context.file = file
    if (line) context.line = line

    return context
  }

  /**
   * Get simplified stack trace for debugging
   */
  static getStackTrace(depth: number = 5): string[] {
    const error = new Error()
    const stack = error.stack?.split('\n') || []

    return stack
      .slice(3, 3 + depth)  // Skip error message and internal calls
      .map(line => {
        // Clean up stack lines
        return line
          .replace(/^\s+at\s+/, '')
          .replace(/^.*\/src\//, 'src/')
          .replace(/\?.*$/, '')
      })
      .filter(line => !line.includes('node_modules'))
  }
}
