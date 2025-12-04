/**
 * User-Configurable Task Types
 *
 * This module defines the data model for user-defined task types.
 * Task types are session-scoped - each session has its own set of types
 * with custom names, emojis, and colors.
 *
 * Key concepts:
 * - UserTaskType: A user-defined category for tasks (e.g., "Deep Work", "Errands")
 * - BlockTypeConfig: How a work block is configured (single type, combo, or system)
 * - TypeAllocation: Ratio allocation for combo blocks
 */

import { generateUniqueId } from './step-id-utils'
import { WorkBlockType, BlockConfigKind } from './enums'

// ============================================================================
// Core Types
// ============================================================================

/**
 * User-configurable task type definition.
 * Stored at the session level - each session has its own set of types.
 */
export interface UserTaskType {
  id: string // Unique identifier (e.g., "type-abc123")
  sessionId: string // Session this type belongs to
  name: string // Display name (e.g., "Deep Work", "Errands")
  emoji: string // Emoji icon (e.g., "🎯", "🛒")
  color: string // Hex color (e.g., "#4A90D9")
  sortOrder: number // For consistent ordering in UI
  createdAt: Date
  updatedAt: Date
}

/**
 * Database representation of UserTaskType (dates as strings).
 */
export interface UserTaskTypeRecord {
  id: string
  sessionId: string
  name: string
  emoji: string
  color: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * Input for creating a new UserTaskType.
 */
export interface CreateUserTaskTypeInput {
  sessionId: string
  name: string
  emoji: string
  color: string
  sortOrder?: number
}

/**
 * Input for updating an existing UserTaskType.
 */
export interface UpdateUserTaskTypeInput {
  name?: string
  emoji?: string
  color?: string
  sortOrder?: number
}

// ============================================================================
// Block Type Configuration
// ============================================================================

/**
 * Allocation of a specific type within a combo block.
 */
export interface TypeAllocation {
  typeId: string // UserTaskType.id
  ratio: number // 0.0 to 1.0, all allocations must sum to 1.0
}

/**
 * Configuration for how a work block handles task types.
 *
 * Three kinds:
 * - BlockConfigKind.Single: Block accepts only one specific task type
 * - BlockConfigKind.Combo: Block accepts multiple types with ratio-based capacity allocation
 * - BlockConfigKind.System: Non-working block (blocked or sleep)
 */
export type BlockTypeConfig =
  | { kind: BlockConfigKind.Single; typeId: string }
  | { kind: BlockConfigKind.Combo; allocations: TypeAllocation[] }
  | { kind: BlockConfigKind.System; systemType: WorkBlockType }

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the color for a task type by ID.
 * Returns a default gray if type not found.
 */
export function getTypeColor(types: UserTaskType[], typeId: string): string {
  const type = types.find((t) => t.id === typeId)
  return type?.color ?? '#808080' // Default gray
}

/**
 * Get the emoji for a task type by ID.
 * Returns a default icon if type not found.
 */
export function getTypeEmoji(types: UserTaskType[], typeId: string): string {
  const type = types.find((t) => t.id === typeId)
  return type?.emoji ?? '📌' // Default pin
}

/**
 * Get the display name for a task type by ID.
 * Returns "Unknown" if type not found.
 */
export function getTypeName(types: UserTaskType[], typeId: string): string {
  const type = types.find((t) => t.id === typeId)
  return type?.name ?? 'Unknown'
}

/**
 * Get a type by its ID.
 */
export function getTypeById(types: UserTaskType[], typeId: string): UserTaskType | undefined {
  return types.find((t) => t.id === typeId)
}

/**
 * Get all types sorted by sortOrder.
 */
export function getSortedTypes(types: UserTaskType[]): UserTaskType[] {
  return [...types].sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * System block type colors for display purposes.
 * Used for combo blocks, system blocks (blocked/sleep), etc.
 */
export const SYSTEM_BLOCK_COLORS: Record<string, string> = {
  [BlockConfigKind.Combo]: 'purple',
  [BlockConfigKind.System]: 'red',
  [WorkBlockType.Blocked]: 'red',
  [WorkBlockType.Sleep]: 'gray',
}

/**
 * Get the display color for a block type string.
 * Handles both system block types (from enums) and user-defined type IDs.
 *
 * @param blockType - Either a system type (BlockConfigKind, WorkBlockType) or user type ID
 * @param userTypes - Array of user-defined task types to search
 * @returns Color string (Arco Design color name or hex value)
 */
export function getBlockTypeDisplayColor(blockType: string, userTypes: UserTaskType[]): string {
  // Check system colors first (enum values)
  if (SYSTEM_BLOCK_COLORS[blockType]) {
    return SYSTEM_BLOCK_COLORS[blockType]
  }

  // Check user-defined type colors
  const userType = userTypes.find(t => t.id === blockType)
  if (userType?.color) {
    return userType.color
  }

  // Default color
  return 'arcoblue'
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate that type allocations sum to 1.0 (with tolerance for floating point).
 */
export function validateTypeAllocations(allocations: TypeAllocation[]): boolean {
  if (allocations.length < 2) {
    return false // Combo blocks must have at least 2 types
  }

  const sum = allocations.reduce((acc, a) => acc + a.ratio, 0)
  const tolerance = 0.001

  if (Math.abs(sum - 1.0) > tolerance) {
    return false // Ratios must sum to 1.0
  }

  // Each ratio must be positive
  for (const allocation of allocations) {
    if (allocation.ratio <= 0 || allocation.ratio >= 1) {
      return false
    }
  }

  // All type IDs must be unique
  const typeIds = allocations.map((a) => a.typeId)
  const uniqueIds = new Set(typeIds)
  if (uniqueIds.size !== typeIds.length) {
    return false
  }

  return true
}

/**
 * Validate a UserTaskType name.
 */
export function validateTypeName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Name cannot be empty' }
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'Name must be 50 characters or less' }
  }

  return { valid: true }
}

/**
 * Validate a hex color string.
 */
export function validateTypeColor(color: string): { valid: boolean; error?: string } {
  const hexPattern = /^#[0-9A-Fa-f]{6}$/

  if (!hexPattern.test(color)) {
    return { valid: false, error: 'Color must be a valid hex color (e.g., #FF5500)' }
  }

  return { valid: true }
}

/**
 * Validate an emoji string (basic check - single emoji or short string).
 */
export function validateTypeEmoji(emoji: string): { valid: boolean; error?: string } {
  if (emoji.length === 0) {
    return { valid: false, error: 'Emoji cannot be empty' }
  }

  // Allow 1-4 characters to handle emoji with modifiers
  if (emoji.length > 4) {
    return { valid: false, error: 'Emoji must be a single emoji character' }
  }

  return { valid: true }
}

/**
 * Validate a complete CreateUserTaskTypeInput.
 */
export function validateCreateInput(input: CreateUserTaskTypeInput): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  const nameValidation = validateTypeName(input.name)
  if (!nameValidation.valid && nameValidation.error) {
    errors.push(nameValidation.error)
  }

  const colorValidation = validateTypeColor(input.color)
  if (!colorValidation.valid && colorValidation.error) {
    errors.push(colorValidation.error)
  }

  const emojiValidation = validateTypeEmoji(input.emoji)
  if (!emojiValidation.valid && emojiValidation.error) {
    errors.push(emojiValidation.error)
  }

  if (!input.sessionId) {
    errors.push('Session ID is required')
  }

  return { valid: errors.length === 0, errors }
}

// ============================================================================
// BlockTypeConfig Utilities
// ============================================================================

/**
 * Check if a block type config is a system block (blocked/sleep).
 */
export function isSystemBlock(config: BlockTypeConfig): config is { kind: BlockConfigKind.System; systemType: WorkBlockType } {
  return config.kind === BlockConfigKind.System
}

/**
 * Check if a block type config is a single-type block.
 */
export function isSingleTypeBlock(config: BlockTypeConfig): config is { kind: BlockConfigKind.Single; typeId: string } {
  return config.kind === BlockConfigKind.Single
}

/**
 * Check if a block type config is a combo block.
 */
export function isComboBlock(config: BlockTypeConfig): config is { kind: BlockConfigKind.Combo; allocations: TypeAllocation[] } {
  return config.kind === BlockConfigKind.Combo
}

/**
 * Get all type IDs referenced in a block type config.
 */
export function getTypeIdsFromConfig(config: BlockTypeConfig): string[] {
  if (config.kind === BlockConfigKind.Single) {
    return [config.typeId]
  }
  if (config.kind === BlockConfigKind.Combo) {
    return config.allocations.map((a) => a.typeId)
  }
  return []
}

/**
 * Check if a task type is compatible with a block type config.
 */
export function isTypeCompatibleWithBlock(taskTypeId: string, config: BlockTypeConfig): boolean {
  if (config.kind === BlockConfigKind.System) {
    return false // System blocks don't accept tasks
  }

  if (config.kind === BlockConfigKind.Single) {
    return config.typeId === taskTypeId
  }

  if (config.kind === BlockConfigKind.Combo) {
    return config.allocations.some((a) => a.typeId === taskTypeId)
  }

  return false
}

/**
 * Get the capacity ratio for a task type in a block config.
 * Returns 1.0 for single-type blocks, the ratio for combo blocks, 0 for incompatible.
 */
export function getTypeRatioInBlock(taskTypeId: string, config: BlockTypeConfig): number {
  if (config.kind === BlockConfigKind.System) {
    return 0
  }

  if (config.kind === BlockConfigKind.Single) {
    return config.typeId === taskTypeId ? 1.0 : 0
  }

  if (config.kind === BlockConfigKind.Combo) {
    const allocation = config.allocations.find((a) => a.typeId === taskTypeId)
    return allocation?.ratio ?? 0
  }

  return 0
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new UserTaskType with generated ID and timestamps.
 */
export function createUserTaskType(input: CreateUserTaskTypeInput): UserTaskType {
  const now = new Date()

  return {
    id: generateUniqueId('type'),
    sessionId: input.sessionId,
    name: input.name.trim(),
    emoji: input.emoji,
    color: input.color.toUpperCase(),
    sortOrder: input.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Create a single-type block config.
 */
export function createSingleTypeConfig(typeId: string): BlockTypeConfig {
  return { kind: BlockConfigKind.Single, typeId }
}

/**
 * Create a combo block config with allocations.
 * Throws if allocations are invalid.
 */
export function createComboTypeConfig(allocations: TypeAllocation[]): BlockTypeConfig {
  if (!validateTypeAllocations(allocations)) {
    throw new Error('Invalid type allocations: must have 2+ types with ratios summing to 1.0')
  }

  return { kind: BlockConfigKind.Combo, allocations }
}

/**
 * Create a system block config.
 */
export function createSystemBlockConfig(systemType: WorkBlockType): BlockTypeConfig {
  return { kind: BlockConfigKind.System, systemType }
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert a database record to a UserTaskType (string dates to Date objects).
 */
export function recordToUserTaskType(record: UserTaskTypeRecord): UserTaskType {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }
}

/**
 * Convert a UserTaskType to a database record (Date objects to ISO strings).
 */
export function userTaskTypeToRecord(type: UserTaskType): UserTaskTypeRecord {
  return {
    ...type,
    createdAt: type.createdAt.toISOString(),
    updatedAt: type.updatedAt.toISOString(),
  }
}

/**
 * Serialize a BlockTypeConfig to JSON string for database storage.
 */
export function serializeBlockTypeConfig(config: BlockTypeConfig): string {
  return JSON.stringify(config)
}

/**
 * Deserialize a BlockTypeConfig from JSON string.
 */
export function deserializeBlockTypeConfig(json: string): BlockTypeConfig {
  const parsed = JSON.parse(json) as BlockTypeConfig

  // Validate the parsed object has expected shape
  if (parsed.kind === BlockConfigKind.Single && typeof parsed.typeId === 'string') {
    return parsed
  }

  if (parsed.kind === BlockConfigKind.Combo && Array.isArray(parsed.allocations)) {
    return parsed
  }

  if (parsed.kind === BlockConfigKind.System && (parsed.systemType === WorkBlockType.Blocked || parsed.systemType === WorkBlockType.Sleep)) {
    return parsed
  }

  throw new Error('Invalid BlockTypeConfig JSON: ' + json)
}

// ============================================================================
// Accumulated Time Utilities
// ============================================================================

/**
 * Type for accumulated time by type ID.
 */
export type AccumulatedTimeByType = Record<string, number>

/**
 * Result type for accumulated work time queries.
 * Groups time by user-defined task type IDs.
 */
export interface AccumulatedTimeResult {
  byType: AccumulatedTimeByType  // typeId -> minutes
  total: number                   // total minutes across all types
}

/**
 * Create an empty accumulated time record.
 */
export function createEmptyAccumulatedTime(): AccumulatedTimeByType {
  return {}
}

/**
 * Add time to accumulated time for a specific type.
 */
export function addAccumulatedTime(
  accumulated: AccumulatedTimeByType,
  typeId: string,
  minutes: number,
): AccumulatedTimeByType {
  return {
    ...accumulated,
    [typeId]: (accumulated[typeId] ?? 0) + minutes,
  }
}

/**
 * Get accumulated time for a specific type (returns 0 if not found).
 */
export function getAccumulatedTimeForType(accumulated: AccumulatedTimeByType, typeId: string): number {
  return accumulated[typeId] ?? 0
}

/**
 * Merge two accumulated time records.
 */
export function mergeAccumulatedTime(
  a: AccumulatedTimeByType,
  b: AccumulatedTimeByType,
): AccumulatedTimeByType {
  const result = { ...a }

  for (const [typeId, minutes] of Object.entries(b)) {
    result[typeId] = (result[typeId] ?? 0) + minutes
  }

  return result
}
