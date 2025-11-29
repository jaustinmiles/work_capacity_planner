/**
 * Enum utility functions
 * Separates enum helper logic from enum definitions for better organization
 */

/**
 * Helper function to ensure exhaustive checks in switch statements
 * Usage:
 * ```
 * switch (status) {
 *   case TaskStatus.NotStarted:
 *     return 'gray'
 *   case TaskStatus.InProgress:
 *     return 'blue'
 *   case TaskStatus.Waiting:
 *     return 'orange'
 *   case TaskStatus.Completed:
 *     return 'green'
 *   default:
 *     return assertNever(status)
 * }
 * ```
 */
export function assertNever(value: never): never {
  // Provide a more helpful error message for debugging
  const displayValue = typeof value === 'object' && value !== null
    ? JSON.stringify(value, null, 2)
    : String(value)
  throw new Error(`Unexpected value: ${displayValue}`)
}

/**
 * Type guard to check if a string is a valid enum value
 */
export function isValidEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: string,
): value is T[keyof T] {
  return Object.values(enumObj).includes(value as T[keyof T])
}

/**
 * Safe enum parser with fallback
 */
export function parseEnum<T extends Record<string, string>>(
  enumObj: T,
  value: string,
  fallback: T[keyof T],
): T[keyof T] {
  if (isValidEnumValue(enumObj, value)) {
    return value as T[keyof T]
  }
  return fallback
}
