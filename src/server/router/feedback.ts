/**
 * Feedback Router
 *
 * Handles feedback operations (development only).
 * Feedback is stored in context/feedback.json (file-based, not in database).
 * This router enables web/client-mode access to feedback data that was
 * previously only accessible via Electron IPC.
 */

import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import { router, protectedProcedure } from '../trpc'

/**
 * Feedback item types present in the feedback data.
 * Includes both user-facing types and internal tracking types.
 */
const feedbackTypeSchema = z.enum([
  'bug',
  'feature',
  'improvement',
  'technical_debt',
  'enhancement',
  'refactoring',
  'other',
])

const feedbackPrioritySchema = z.enum(['critical', 'high', 'medium', 'low'])

/**
 * Schema for a feedback item
 */
const feedbackItemSchema = z.object({
  type: feedbackTypeSchema,
  priority: feedbackPrioritySchema,
  title: z.string(),
  description: z.string(),
  components: z.array(z.string()).optional(),
  steps: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  timestamp: z.string(),
  sessionId: z.string(),
  resolved: z.boolean().optional(),
  resolvedDate: z.string().optional(),
  resolvedIn: z.string().optional(),
})

type FeedbackItem = z.infer<typeof feedbackItemSchema>

/** Resolve feedback.json path relative to project root */
function getFeedbackPath(): string {
  return path.join(process.cwd(), 'context', 'feedback.json')
}

/**
 * Flatten potentially nested feedback arrays into a flat list.
 * Handles legacy data where items may be nested arrays.
 */
function flattenFeedbackItems(items: unknown): FeedbackItem[] {
  const result: FeedbackItem[] = []

  if (Array.isArray(items)) {
    for (const item of items) {
      if (Array.isArray(item)) {
        result.push(...flattenFeedbackItems(item))
      } else if (item && typeof item === 'object' && 'type' in item) {
        result.push(item as FeedbackItem)
      }
    }
  } else if (items && typeof items === 'object' && 'type' in items) {
    result.push(items as FeedbackItem)
  }

  return result
}

/** Read and parse feedback.json, returning flattened items */
async function readFeedbackFile(): Promise<FeedbackItem[]> {
  try {
    const data = await fs.readFile(getFeedbackPath(), 'utf-8')
    const parsed: unknown = JSON.parse(data)
    return flattenFeedbackItems(parsed)
  } catch {
    return []
  }
}

/** Write feedback items to feedback.json */
async function writeFeedbackFile(items: FeedbackItem[]): Promise<void> {
  const feedbackPath = getFeedbackPath()
  await fs.mkdir(path.dirname(feedbackPath), { recursive: true })
  await fs.writeFile(feedbackPath, JSON.stringify(items, null, 2))
}

/** Check if two feedback items are duplicates by timestamp+sessionId */
function isDuplicate(a: FeedbackItem, b: FeedbackItem): boolean {
  return a.timestamp === b.timestamp && a.sessionId === b.sessionId
}

export const feedbackRouter = router({
  /**
   * Load all feedback items
   */
  load: protectedProcedure.query(async (): Promise<FeedbackItem[]> => {
    return readFeedbackFile()
  }),

  /**
   * Save new feedback item(s), deduplicating by timestamp+sessionId
   */
  save: protectedProcedure
    .input(
      z.object({
        items: z.union([feedbackItemSchema, z.array(feedbackItemSchema)]),
      }),
    )
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      const existing = await readFeedbackFile()
      const newItems = Array.isArray(input.items) ? input.items : [input.items]

      for (const item of newItems) {
        const alreadyExists = existing.some((e) => isDuplicate(e, item))
        if (!alreadyExists) {
          existing.push(item)
        }
      }

      await writeFeedbackFile(existing)
      return { success: true }
    }),

  /**
   * Update full feedback array (for resolve/edit operations)
   */
  update: protectedProcedure
    .input(
      z.object({
        items: z.array(feedbackItemSchema),
      }),
    )
    .mutation(async ({ input }): Promise<{ success: boolean }> => {
      // Deduplicate by timestamp+sessionId
      const unique = input.items.filter(
        (item, index, self) =>
          index === self.findIndex((f) => isDuplicate(f, item)),
      )

      await writeFeedbackFile(unique)
      return { success: true }
    }),
})
