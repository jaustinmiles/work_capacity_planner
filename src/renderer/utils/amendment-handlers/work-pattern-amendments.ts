/**
 * Handlers for work pattern amendments
 */

import type { WorkPatternModification } from '@shared/amendment-types'
import { BlockConfigKind, WorkBlockType, WorkPatternOperation } from '@shared/enums'
import { dateToYYYYMMDD, extractTimeFromISO } from '@shared/time-utils'
import { getBlockTypeName } from '@shared/user-task-types'
import { generateUniqueId } from '@shared/step-id-utils'
import type { HandlerContext } from './types'
import { Message } from '../../components/common/Message'
import { useWorkPatternStore } from '../../store/useWorkPatternStore'
import { useUserTaskTypeStore } from '../../store/useUserTaskTypeStore'
import { logger } from '@/logger'

export async function handleWorkPatternModification(
  amendment: WorkPatternModification,
  ctx: HandlerContext,
): Promise<void> {
  // Date is now always a proper Date object after transformation in amendment-validator.ts
  // Use local date extraction to get YYYY-MM-DD string
  const dateStr = dateToYYYYMMDD(amendment.date)

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
          id: generateUniqueId('blk'),
          startTime: startTimeStr,
          endTime: endTimeStr,
          typeConfig: typeConfig,  // Use typeConfig object, not type string
        }

        if (existingPattern) {
          // Add block to existing pattern
          // CRITICAL: Must preserve block IDs and typeConfig or database will treat all blocks as "to delete"
          // Use 'blocks' (parsed typeConfig objects) not 'WorkBlock' (raw JSON strings)
          // WorkBlock.typeConfig is a JSON string, blocks[].typeConfig is already parsed
          const existingBlocks = existingPattern.blocks || []
          const updatedBlocks = [...existingBlocks.map((b: any) => ({
            id: b.id,  // Preserve existing block ID
            startTime: b.startTime,
            endTime: b.endTime,
            typeConfig: b.typeConfig,  // Already a parsed object from 'blocks'
          })), newBlock]
          await ctx.db.updateWorkPattern(existingPattern.id, {
            blocks: updatedBlocks,
          })
        } else {
          // Create new pattern with this block
          await ctx.db.createWorkPattern({
            date: dateStr,
            blocks: [newBlock as any],
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
          id: generateUniqueId('mtg'),
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
          const updatedBlocks = existingBlocks.map((b: any) => ({
            id: b.id,  // Preserve existing block ID
            startTime: b.startTime,
            endTime: b.endTime,
            typeConfig: b.typeConfig,  // Already a parsed object from 'blocks'
          }))
          const updatedMeetings = [...existingMeetings.map((m: any) => ({
            id: m.id,  // Preserve existing meeting ID
            name: m.name,
            startTime: m.startTime,
            endTime: m.endTime,
            type: m.type,
            recurring: m.recurring || 'none', // Ensure non-null for Prisma
            daysOfWeek: m.daysOfWeek,
          })), newMeeting]
          await ctx.db.updateWorkPattern(existingPattern.id, {
            blocks: updatedBlocks,
            meetings: updatedMeetings,
          })
        } else {
          await ctx.db.createWorkPattern({
            date: dateStr,
            blocks: [],
            meetings: [newMeeting as any],
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
          (b: any) => b.id !== amendment.blockId,
        )
        // CRITICAL: Must preserve block IDs for blocks we're keeping
        const updatedBlocks = filteredBlocks.map((b: any) => ({
          id: b.id,  // Preserve existing block ID
          startTime: b.startTime,
          endTime: b.endTime,
          typeConfig: b.typeConfig,  // Already a parsed object from 'blocks'
        }))
        await ctx.db.updateWorkPattern(existingPattern.id, {
          blocks: updatedBlocks,
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
          (m: any) => m.id !== amendment.meetingId,
        )
        // CRITICAL: Must preserve meeting IDs for meetings we're keeping
        const updatedMeetings = filteredMeetings.map((m: any) => ({
          id: m.id,  // Preserve existing meeting ID
          name: m.name,
          startTime: m.startTime,
          endTime: m.endTime,
          type: m.type,
          recurring: m.recurring || 'none', // Ensure non-null for Prisma
          daysOfWeek: m.daysOfWeek,
        }))
        await ctx.db.updateWorkPattern(existingPattern.id, {
          meetings: updatedMeetings,
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
