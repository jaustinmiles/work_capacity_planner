/**
 * Feedback Service
 *
 * Provides feedback read/write operations with a fallback chain:
 * 1. tRPC (works for web clients and Electron)
 * 2. Electron IPC (works when running in Electron with preload)
 * 3. localStorage (last resort fallback)
 *
 * This ensures feedback works across all access modes:
 * server Electron, client Electron, and web browser.
 */

import { createDynamicClient, type ApiClient } from '@shared/trpc-client'

const LOCALSTORAGE_KEY = 'task-planner-feedback'

/** Feedback item matching the server schema */
export interface FeedbackItem {
  type: 'bug' | 'feature' | 'improvement' | 'technical_debt' | 'enhancement' | 'refactoring' | 'other'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  components?: string[]
  steps?: string
  expected?: string
  actual?: string
  timestamp: string
  sessionId: string
  resolved?: boolean
  resolvedDate?: string
  resolvedIn?: string
}

/** Flatten potentially nested feedback arrays */
function flattenFeedback(data: unknown): FeedbackItem[] {
  const items: FeedbackItem[] = []
  const processItem = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(processItem)
    } else if (item && typeof item === 'object' && 'type' in item) {
      items.push(item as FeedbackItem)
    }
  }
  if (Array.isArray(data)) {
    data.forEach(processItem)
  }
  return items
}

/** Check if tRPC is available (appConfig exists with a valid server URL) */
function hasTrpcAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.appConfig !== 'undefined' &&
    Boolean(window.appConfig.serverUrl)
  )
}

/** Check if Electron IPC is available */
function hasElectronAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.electronAPI !== 'undefined' &&
    typeof window.electronAPI.loadFeedback === 'function'
  )
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

/**
 * Load all feedback items using the best available transport.
 * Fallback: tRPC → Electron IPC → localStorage
 */
export async function loadFeedback(): Promise<FeedbackItem[]> {
  // Try tRPC first (works for both web and Electron clients)
  if (hasTrpcAccess()) {
    try {
      const data = await getTrpcClient().feedback.load.query()
      return flattenFeedback(data)
    } catch {
      // tRPC failed, try next fallback
    }
  }

  // Try Electron IPC
  if (hasElectronAccess()) {
    try {
      const data = await window.electronAPI!.loadFeedback!()
      return flattenFeedback(data)
    } catch {
      // IPC failed, try next fallback
    }
  }

  // Last resort: localStorage
  try {
    const stored = window.localStorage.getItem(LOCALSTORAGE_KEY)
    if (stored) {
      return flattenFeedback(JSON.parse(stored))
    }
  } catch {
    // localStorage unavailable or corrupted
  }

  return []
}

/**
 * Save new feedback item(s), deduplicating by timestamp+sessionId.
 * Fallback: tRPC → Electron IPC → localStorage
 */
export async function saveFeedback(items: FeedbackItem | FeedbackItem[]): Promise<boolean> {
  const itemArray = Array.isArray(items) ? items : [items]

  // Try tRPC first
  if (hasTrpcAccess()) {
    try {
      await getTrpcClient().feedback.save.mutate({ items: itemArray })
      return true
    } catch {
      // tRPC failed, try next fallback
    }
  }

  // Try Electron IPC
  if (hasElectronAccess()) {
    try {
      await window.electronAPI!.saveFeedback!(itemArray)
      return true
    } catch {
      // IPC failed, try next fallback
    }
  }

  // Last resort: localStorage
  try {
    const existing = await loadFeedback()
    const merged = [...existing]
    for (const item of itemArray) {
      const isDuplicate = merged.some(
        (e) => e.timestamp === item.timestamp && e.sessionId === item.sessionId,
      )
      if (!isDuplicate) {
        merged.push(item)
      }
    }
    window.localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(merged))
    return true
  } catch {
    return false
  }
}

/**
 * Update the full feedback array (for resolve/edit operations).
 * Fallback: tRPC → Electron IPC → localStorage
 */
export async function updateFeedback(allItems: FeedbackItem[]): Promise<boolean> {
  // Try tRPC first
  if (hasTrpcAccess()) {
    try {
      await getTrpcClient().feedback.update.mutate({ items: allItems })
      return true
    } catch {
      // tRPC failed, try next fallback
    }
  }

  // Try Electron IPC
  if (hasElectronAccess()) {
    try {
      await window.electronAPI!.updateFeedback!(allItems)
      return true
    } catch {
      // IPC failed, try next fallback
    }
  }

  // Last resort: localStorage
  try {
    window.localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(allItems))
    return true
  } catch {
    return false
  }
}

/**
 * Read existing feedback (alias for loadFeedback, matching Electron API naming).
 */
export async function readFeedback(): Promise<FeedbackItem[]> {
  return loadFeedback()
}
