/**
 * Feedback Service
 *
 * tRPC is the ONLY transport: every client submits through the feedback
 * router into the central Feedback table (the legacy Electron IPC file path
 * is gone). localStorage is an explicit OFFLINE QUEUE, never a store: when a
 * submit fails the item is queued locally and the caller receives
 * { queued: true } so the UI can say "saved locally — will retry". The queue
 * is flushed on app start and after the next successful submit; the server
 * dedupes retries by timestamp+sessionId so a double flush cannot duplicate.
 */

import { createDynamicClient, type ApiClient } from '@shared/trpc-client'
import { logger } from '@/logger'
import type {
  FeedbackItemDto,
  FeedbackType,
  FeedbackPriority,
} from '../../server/router/feedback'

const OFFLINE_QUEUE_KEY = 'task-planner-feedback-queue'
/** Pre-table localStorage sink (the old silent last-resort store) — migrated into the queue on flush */
const LEGACY_LOCALSTORAGE_KEY = 'task-planner-feedback'

export type { FeedbackType, FeedbackPriority }

/** Feedback item as rendered by the UI (dates as ISO strings) */
export interface FeedbackItem {
  id: string
  type: FeedbackType
  priority: FeedbackPriority
  title: string
  description: string
  components: string[] | null
  steps: string | null
  expected: string | null
  actual: string | null
  timestamp: string
  sessionId: string
  resolved: boolean
  resolvedDate: string | null
  resolvedIn: string | null
}

/** A not-yet-submitted feedback item (also the offline queue entry shape) */
export interface NewFeedbackItem {
  type: FeedbackType
  priority: FeedbackPriority
  title: string
  description: string
  components?: string[]
  steps?: string
  expected?: string
  actual?: string
  timestamp: string
  sessionId: string
}

/** Partial edit of a single feedback item (mirrors the server patch schema) */
export interface FeedbackPatch {
  type?: FeedbackType
  priority?: FeedbackPriority
  title?: string
  description?: string
  components?: string[]
  steps?: string
  expected?: string
  actual?: string
  resolved?: boolean
  resolvedIn?: string
}

/** Result of a submit: either persisted server-side or queued locally for retry */
export interface SaveFeedbackResult {
  queued: boolean
  id: string | null
}

/** Optional server-side filters for listing feedback */
export interface FeedbackListFilters {
  resolved?: boolean
  type?: FeedbackType
  priority?: FeedbackPriority
}

/** Cached tRPC client for feedback operations */
let trpcClient: ApiClient | null = null

function getTrpcClient(): ApiClient {
  if (!trpcClient) {
    trpcClient = createDynamicClient(
      window.appConfig.serverUrl,
      window.appConfig.apiKey,
      () => null, // Feedback doesn't need session scoping
    )
  }
  return trpcClient
}

/** Map a server DTO (superjson-revived Dates) to the renderer shape (ISO strings) */
function toRendererItem(dto: FeedbackItemDto): FeedbackItem {
  return {
    id: dto.id,
    type: dto.type,
    priority: dto.priority,
    title: dto.title,
    description: dto.description,
    components: dto.components,
    steps: dto.steps,
    expected: dto.expected,
    actual: dto.actual,
    timestamp: dto.timestamp.toISOString(),
    sessionId: dto.sessionId,
    resolved: dto.resolved,
    resolvedDate: dto.resolvedDate ? dto.resolvedDate.toISOString() : null,
    resolvedIn: dto.resolvedIn,
  }
}

function parseFeedbackType(value: unknown): FeedbackType | null {
  if (
    value === 'bug' ||
    value === 'feature' ||
    value === 'improvement' ||
    value === 'technical_debt' ||
    value === 'enhancement' ||
    value === 'refactoring' ||
    value === 'other'
  ) {
    return value
  }
  return null
}

function parseFeedbackPriority(value: unknown): FeedbackPriority | null {
  if (
    value === 'critical' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low'
  ) {
    return value
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const strings = value.filter(
    (entry): entry is string => typeof entry === 'string',
  )
  return strings.length > 0 ? strings : undefined
}

/** Parse one queue/legacy entry; null if it lacks the required fields */
function parseQueueEntry(value: unknown): NewFeedbackItem | null {
  if (!isRecord(value)) {
    return null
  }
  const type = parseFeedbackType(value.type)
  const priority = parseFeedbackPriority(value.priority)
  const title = optionalString(value.title)
  const description = optionalString(value.description)
  const timestamp = optionalString(value.timestamp)
  const sessionId = optionalString(value.sessionId)
  if (!type || !priority || !title || !description || !timestamp || !sessionId) {
    return null
  }
  return {
    type,
    priority,
    title,
    description,
    components: optionalStringArray(value.components),
    steps: optionalString(value.steps),
    expected: optionalString(value.expected),
    actual: optionalString(value.actual),
    timestamp,
    sessionId,
  }
}

/** Recursively flatten legacy data (the old sink sometimes nested arrays) */
function flattenEntries(value: unknown, out: NewFeedbackItem[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenEntries(entry, out))
    return
  }
  const parsed = parseQueueEntry(value)
  if (parsed) {
    out.push(parsed)
  }
}

function readQueue(): NewFeedbackItem[] {
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY)
    if (!raw) {
      return []
    }
    const items: NewFeedbackItem[] = []
    flattenEntries(JSON.parse(raw), items)
    return items
  } catch {
    return []
  }
}

function writeQueue(items: NewFeedbackItem[]): void {
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(OFFLINE_QUEUE_KEY)
    } else {
      window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items))
    }
  } catch {
    // localStorage unavailable — nothing else we can do offline
  }
}

/** timestamp+sessionId is the identity key the server dedupes by */
function isSameSubmission(a: NewFeedbackItem, b: NewFeedbackItem): boolean {
  return a.timestamp === b.timestamp && a.sessionId === b.sessionId
}

function enqueue(item: NewFeedbackItem): void {
  const queue = readQueue()
  if (queue.some((existing) => isSameSubmission(existing, item))) {
    return
  }
  writeQueue([...queue, item])
}

/**
 * One-time rescue of items stranded in the legacy localStorage sink:
 * move them into the explicit queue so the next flush submits them.
 */
function migrateLegacySink(): void {
  try {
    const raw = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)
    if (!raw) {
      return
    }
    const legacyItems: NewFeedbackItem[] = []
    flattenEntries(JSON.parse(raw), legacyItems)
    const queue = readQueue()
    const merged = [...queue]
    for (const item of legacyItems) {
      if (!merged.some((existing) => isSameSubmission(existing, item))) {
        merged.push(item)
      }
    }
    writeQueue(merged)
    window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY)
  } catch {
    // Corrupted legacy data — leave it; the archive file still has everything
  }
}

/** Build the tRPC add input from a queue/new item */
function toAddInput(item: NewFeedbackItem): {
  type: FeedbackType
  priority: FeedbackPriority
  title: string
  description: string
  components?: string[]
  steps?: string
  expected?: string
  actual?: string
  sessionId: string
  timestamp: Date
} {
  return {
    type: item.type,
    priority: item.priority,
    title: item.title,
    description: item.description,
    components: item.components,
    steps: item.steps,
    expected: item.expected,
    actual: item.actual,
    sessionId: item.sessionId,
    timestamp: new Date(item.timestamp),
  }
}

/**
 * Flush the offline queue to the server. Stops at the first failure (server
 * still unreachable) and keeps the remaining items queued, in order.
 * Never throws. Returns the number of items successfully submitted.
 */
export async function flushFeedbackQueue(): Promise<number> {
  migrateLegacySink()
  const queue = readQueue()
  if (queue.length === 0) {
    return 0
  }

  const remaining: NewFeedbackItem[] = []
  let flushed = 0
  for (const item of queue) {
    if (remaining.length > 0) {
      // A previous item already failed — keep order, stop hammering the server
      remaining.push(item)
      continue
    }
    try {
      await getTrpcClient().feedback.add.mutate(toAddInput(item))
      flushed++
    } catch {
      remaining.push(item)
    }
  }
  writeQueue(remaining)

  if (flushed > 0) {
    logger.ui.info('Flushed offline feedback queue', {
      flushed,
      remaining: remaining.length,
    }, 'feedback-queue-flush')
  }
  return flushed
}

/**
 * Load feedback items from the central table (newest first).
 */
export async function loadFeedback(
  filters?: FeedbackListFilters,
): Promise<FeedbackItem[]> {
  const rows = await getTrpcClient().feedback.list.query(filters)
  return rows.map(toRendererItem)
}

/**
 * Submit one feedback item. On success the offline queue is also flushed.
 * On failure the item is queued locally and `{ queued: true }` is returned
 * so the UI can tell the user it was saved locally and will be retried.
 */
export async function saveFeedback(
  item: NewFeedbackItem,
): Promise<SaveFeedbackResult> {
  try {
    const result = await getTrpcClient().feedback.add.mutate(toAddInput(item))
    await flushFeedbackQueue()
    return { queued: false, id: result.id }
  } catch (error) {
    logger.ui.warn('Feedback submit failed — queued locally for retry', {
      error: error instanceof Error ? error.message : String(error),
    }, 'feedback-submit-queued')
    enqueue(item)
    return { queued: true, id: null }
  }
}

/**
 * Mark a single feedback item resolved by id.
 */
export async function resolveFeedbackItem(id: string): Promise<FeedbackItem> {
  const updated = await getTrpcClient().feedback.resolve.mutate({ id })
  return toRendererItem(updated)
}

/**
 * Patch a single feedback item by id. Only the given fields change, so
 * concurrent edits to OTHER items can never be erased (this replaces the
 * legacy full-array overwrite).
 */
export async function updateFeedbackItem(
  id: string,
  patch: FeedbackPatch,
): Promise<FeedbackItem> {
  const updated = await getTrpcClient().feedback.update.mutate({ id, patch })
  return toRendererItem(updated)
}
