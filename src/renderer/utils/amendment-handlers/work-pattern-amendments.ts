/**
 * Handlers for work pattern amendments
 */

import type { WorkPatternModification } from '@shared/amendment-types'
import { BlockConfigKind, WorkBlockType, WorkPatternOperation } from '@shared/enums'
import { generateUniqueId } from '@shared/step-id-utils'
import { dateToYYYYMMDD, extractTimeFromISO, safeParseDateString } from '@shared/time-utils'
import { getBlockTypeName } from '@shared/user-task-types'
import type { WorkBlock, Meeting } from '@shared/work-blocks-types'
import type { HandlerContext } from './types'
import { Message } from '../../components/common/Message'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { useUserTaskTypeStore } from '../../store/useUserTaskTypeStore'
import { logger } from '@/logger'

export async function handleWorkPatternModification(
  amendment: WorkPatternModification,
  ctx: HandlerContext,
): Promise<void> {
  // Date may be a Date object (fresh from AI) or string (after database round-trip)
  // Handle both cases safely
  const amendmentDate = typeof amendment.date === 'string'
    ? safeParseDateString(amendment.date) || new Date()
    : amendment.date
  const dateStr = dateToYYYYMMDD(amendmentDate)

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

        // Extract time directly from ISO string to avoid timezone conversion issues
        // The AI provides times that represent local time encoded in ISO format
        const startTimeStr = extractTimeFromISO(amendment.blockData.startTime)
        const endTimeStr = extractTimeFromISO(amendment.blockData.endTime)

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
          id: generateUniqueId('block'),
          startTime: startTimeStr,
          endTime: endTimeStr,
          typeConfig: typeConfig,  // Use typeConfig object, not type string
          splitRatio: amendment.blockData.splitRatio || null,
        }

        if (existingPattern && existingPattern.id) {
          // Add block to existing pattern
          // CRITICAL: Must preserve block IDs and typeConfig or database will treat all blocks as "to delete"
          // Use 'blocks' (parsed typeConfig objects) not 'WorkBlock' (raw JSON strings)
          // WorkBlock.typeConfig is a JSON string, blocks[].typeConfig is already parsed
          const existingBlocks = existingPattern.blocks || []
          await ctx.db.updateWorkPattern(existingPattern.id, {
            blocks: [...existingBlocks, newBlock as WorkBlock],
          })
        } else {
          // Create new pattern with this block
          await ctx.db.createWorkPattern({
            date: dateStr,
            blocks: [newBlock as WorkBlock],
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

        // Extract time directly from ISO string to avoid timezone conversion issues
        const meetingStartStr = extractTimeFromISO(amendment.meetingData.startTime)
        const meetingEndStr = extractTimeFromISO(amendment.meetingData.endTime)

        const newMeeting = {
          id: generateUniqueId('meeting'),
          name: amendment.meetingData.name,
          startTime: meetingStartStr,
          endTime: meetingEndStr,
          type: amendment.meetingData.type,
          recurring: amendment.meetingData.recurring || 'none', // Default to 'none' - Prisma requires non-null
          // Zod schema uses .optional() which accepts undefined but NOT null
          daysOfWeek: amendment.meetingData.daysOfWeek || undefined,
        }

        if (existingPattern && existingPattern.id) {
          // CRITICAL: Must preserve IDs or database will treat existing entries as "to delete"
          const existingMeetings = existingPattern.meetings || []
          await ctx.db.updateWorkPattern(existingPattern.id, {
            blocks: existingPattern.blocks || [],
            meetings: [...existingMeetings, newMeeting as Meeting],
          })
        } else {
          await ctx.db.createWorkPattern({
            date: dateStr,
            blocks: [],
            meetings: [newMeeting as Meeting],
          })
        }

        useWorkPatternStore.getState().loadWorkPatterns()
        Message.success(`Added meeting "${amendment.meetingData.name}": ${meetingStartStr} - ${meetingEndStr}`)
        break
      }

      case WorkPatternOperation.RemoveBlock: {
        if (!existingPattern || !existingPattern.id || !amendment.blockId) {
          Message.warning('Cannot remove block - pattern or block ID not found')
          ctx.markFailed('Cannot remove block - pattern or block ID not found')
          break
        }

        // Filter out the block to remove
        const filteredBlocks = (existingPattern.blocks || []).filter(
          (b) => b.id !== amendment.blockId,
        )
        await ctx.db.updateWorkPattern(existingPattern.id, {
          blocks: filteredBlocks,
        })

        useWorkPatternStore.getState().loadWorkPatterns()
        Message.success('Removed work block')
        break
      }

      case WorkPatternOperation.RemoveMeeting: {
        if (!existingPattern || !existingPattern.id || !amendment.meetingId) {
          Message.warning('Cannot remove meeting - pattern or meeting ID not found')
          ctx.markFailed('Cannot remove meeting - pattern or meeting ID not found')
          break
        }

        // Filter out the meeting to remove
        const filteredMeetings = (existingPattern.meetings || []).filter(
          (m) => m.id !== amendment.meetingId,
        )
        await ctx.db.updateWorkPattern(existingPattern.id, {
          meetings: filteredMeetings,
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
