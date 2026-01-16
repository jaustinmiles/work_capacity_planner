/**
 * Handlers for work pattern amendments
 */

import type { WorkPatternModification } from '@shared/amendment-types'
import { BlockConfigKind, WorkBlockType, WorkPatternOperation } from '@shared/enums'
import { getBlockTypeName } from '@shared/user-task-types'
import type { HandlerContext } from './types'
import { Message } from '../../components/common/Message'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { useUserTaskTypeStore } from '../../store/useUserTaskTypeStore'
import { logger } from '@/logger'

export async function handleWorkPatternModification(
  amendment: WorkPatternModification,
  ctx: HandlerContext,
): Promise<void> {
  // amendment.date is now a LocalDate (branded "YYYY-MM-DD" string)
  // No conversion needed - use directly
  const dateStr = amendment.date

  logger.ui.info('WorkPatternModification processing', {
    operation: amendment.operation,
    originalDate: String(amendment.date),
    parsedDateStr: dateStr,
  }, 'work-pattern-mod')

  try {
    // Get existing pattern for this date
    const existingPattern = await ctx.db.getWorkPattern(dateStr)

    switch (amendment.operation) {
      case WorkPatternOperation.AddBlock: {
        if (!amendment.blockData) {
          Message.warning('Block data required for AddBlock operation')
          ctx.markFailed('Block data required for AddBlock operation')
          break
        }

        // Times are already LocalTime strings ("HH:MM" format) - use directly
        const startTimeStr = amendment.blockData.startTime
        const endTimeStr = amendment.blockData.endTime

        // Convert type ID to proper BlockTypeConfig object
        // Database expects typeConfig: { kind, typeId/systemType }, not just a type string
        const typeId = amendment.blockData.type
        // Check for system block types (blocked, sleep) - compare as strings since typeId comes from AI
        const isBlockedType = typeId === 'blocked' || typeId === (WorkBlockType.Blocked as string)
        const isSleepType = typeId === 'sleep' || typeId === (WorkBlockType.Sleep as string)
        const typeConfig = isBlockedType
          ? { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked }
          : isSleepType
          ? { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep }
          : { kind: BlockConfigKind.Single, typeId: typeId }

        const newBlock = {
          startTime: startTimeStr,
          endTime: endTimeStr,
          typeConfig: typeConfig,  // Use typeConfig object, not type string
          splitRatio: amendment.blockData.splitRatio || null,
        }

        if (existingPattern) {
          // Add block to existing pattern
          // CRITICAL: Must preserve block IDs and typeConfig or database will treat all blocks as "to delete"
          // Use 'blocks' (parsed typeConfig objects) not 'WorkBlock' (raw JSON strings)
          // WorkBlock.typeConfig is a JSON string, blocks[].typeConfig is already parsed
          const existingBlocks = existingPattern.blocks || []
          await ctx.db.updateWorkPattern(existingPattern.id, {
            blocks: [...existingBlocks.map((b: { id: string; startTime: string; endTime: string; typeConfig?: unknown; splitRatio?: Record<string, number> | null }) => ({
              id: b.id,  // Preserve existing block ID
              startTime: b.startTime,
              endTime: b.endTime,
              typeConfig: b.typeConfig,  // Already a parsed object from 'blocks'
              splitRatio: b.splitRatio,
            })), newBlock],
          })
        } else {
          // Create new pattern with this block
          await ctx.db.createWorkPattern({
            date: dateStr,
            blocks: [newBlock],
            meetings: [],
          })
        }

        // Refresh work pattern store reactively
        useWorkPatternStore.getState().loadWorkPatterns()
        Message.success(`Added ${getBlockTypeName(typeId, useUserTaskTypeStore.getState().types)} block: ${startTimeStr} - ${endTimeStr}`)
        break
      }

      case WorkPatternOperation.AddMeeting: {
        if (!amendment.meetingData) {
          Message.warning('Meeting data required for AddMeeting operation')
          ctx.markFailed('Meeting data required for AddMeeting operation')
          break
        }

        // Times are already LocalTime strings ("HH:MM" format) - use directly
        const meetingStartStr = amendment.meetingData.startTime
        const meetingEndStr = amendment.meetingData.endTime

        const newMeeting = {
          name: amendment.meetingData.name,
          startTime: meetingStartStr,
          endTime: meetingEndStr,
          type: amendment.meetingData.type,
          recurring: amendment.meetingData.recurring || 'none', // Default to 'none' - Prisma requires non-null
          daysOfWeek: amendment.meetingData.daysOfWeek || null,
        }

        if (existingPattern) {
          // CRITICAL: Must preserve IDs or database will treat existing entries as "to delete"
          // Use 'meetings' and 'blocks' (parsed) not 'WorkMeeting'/'WorkBlock' (raw JSON strings)
          const existingMeetings = existingPattern.meetings || []
          const existingBlocks = existingPattern.blocks || []
          await ctx.db.updateWorkPattern(existingPattern.id, {
            blocks: existingBlocks.map((b: { id: string; startTime: string; endTime: string; typeConfig?: unknown; splitRatio?: Record<string, number> | null }) => ({
              id: b.id,  // Preserve existing block ID
              startTime: b.startTime,
              endTime: b.endTime,
              typeConfig: b.typeConfig,  // Already a parsed object from 'blocks'
              splitRatio: b.splitRatio,
            })),
            meetings: [...existingMeetings.map((m: { id: string; name: string; startTime: string; endTime: string; type: string; recurring?: string | null; daysOfWeek?: number[] | null }) => ({
              id: m.id,  // Preserve existing meeting ID
              name: m.name,
              startTime: m.startTime,
              endTime: m.endTime,
              type: m.type,
              recurring: m.recurring || 'none', // Ensure non-null for Prisma
              daysOfWeek: m.daysOfWeek,
            })), newMeeting],
          })
        } else {
          await ctx.db.createWorkPattern({
            date: dateStr,
            blocks: [],
            meetings: [newMeeting],
          })
        }

        useWorkPatternStore.getState().loadWorkPatterns()
        Message.success(`Added meeting "${amendment.meetingData.name}": ${meetingStartStr} - ${meetingEndStr}`)
        break
      }

      case WorkPatternOperation.RemoveBlock: {
        if (!existingPattern || !amendment.blockId) {
          Message.warning('Cannot remove block - pattern or block ID not found')
          ctx.markFailed('Cannot remove block - pattern or block ID not found')
          break
        }

        // Use 'blocks' (parsed typeConfig objects) not 'WorkBlock' (raw JSON strings)
        const filteredBlocks = (existingPattern.blocks || []).filter(
          (b: { id: string }) => b.id !== amendment.blockId,
        )
        // CRITICAL: Must preserve block IDs for blocks we're keeping
        await ctx.db.updateWorkPattern(existingPattern.id, {
          blocks: filteredBlocks.map((b: { id: string; startTime: string; endTime: string; typeConfig?: unknown; splitRatio?: Record<string, number> | null }) => ({
            id: b.id,  // Preserve existing block ID
            startTime: b.startTime,
            endTime: b.endTime,
            typeConfig: b.typeConfig,  // Already a parsed object from 'blocks'
            splitRatio: b.splitRatio,
          })),
        })

        useWorkPatternStore.getState().loadWorkPatterns()
        Message.success('Removed work block')
        break
      }

      case WorkPatternOperation.RemoveMeeting: {
        if (!existingPattern || !amendment.meetingId) {
          Message.warning('Cannot remove meeting - pattern or meeting ID not found')
          ctx.markFailed('Cannot remove meeting - pattern or meeting ID not found')
          break
        }

        // Use 'meetings' (parsed daysOfWeek) not 'WorkMeeting' (raw JSON strings)
        const filteredMeetings = (existingPattern.meetings || []).filter(
          (m: { id: string }) => m.id !== amendment.meetingId,
        )
        // CRITICAL: Must preserve meeting IDs for meetings we're keeping
        await ctx.db.updateWorkPattern(existingPattern.id, {
          meetings: filteredMeetings.map((m: { id: string; name: string; startTime: string; endTime: string; type: string; recurring?: string | null; daysOfWeek?: number[] | null }) => ({
            id: m.id,  // Preserve existing meeting ID
            name: m.name,
            startTime: m.startTime,
            endTime: m.endTime,
            type: m.type,
            recurring: m.recurring || 'none', // Ensure non-null for Prisma
            daysOfWeek: m.daysOfWeek,
          })),
        })

        useWorkPatternStore.getState().loadWorkPatterns()
        Message.success('Removed meeting')
        break
      }

      case WorkPatternOperation.ModifyBlock:
      case WorkPatternOperation.ModifyMeeting: {
        // These require more complex logic - for now show info message
        Message.info('Block/meeting modification coming soon')
        break
      }

      default: {
        Message.warning(`Unknown work pattern operation: ${amendment.operation}`)
        ctx.markFailed(`Unknown work pattern operation: ${amendment.operation}`)
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.ui.error('Failed to modify work pattern', {
      error: errMsg,
      date: dateStr,
      operation: amendment.operation,
    }, 'work-pattern-modification-error')
    ctx.markFailed(`Failed to modify work pattern: ${errMsg}`)
  }
}
