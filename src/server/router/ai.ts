/**
 * AI Router
 *
 * Exposes AI operations via tRPC for web clients.
 * All AI calls go through the server which owns the API keys.
 *
 * Uses:
 * - Claude (Anthropic) for all AI operations (brainstorm, workflows, chat, amendments)
 * - OpenAI Whisper for speech transcription (handled by speech router)
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { getAIService } from '../../shared/ai-service'
import { ChatMessageRole } from '../../shared/enums'

/**
 * Zod schema for chat messages
 * Only User and Assistant roles are valid for AICallOptions
 */
const chatMessageSchema = z.object({
  role: z.enum([ChatMessageRole.User, ChatMessageRole.Assistant]),
  content: z.string(),
})

/**
 * Zod schema for AI call options
 */
const aiCallOptionsSchema = z.object({
  systemPrompt: z.string(),
  messages: z.array(chatMessageSchema),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
})

/**
 * Zod schema for task enhancement context
 */
const taskEnhanceContextSchema = z.object({
  description: z.string().optional(),
  duration: z.number().optional(),
  importance: z.number().optional(),
  urgency: z.number().optional(),
})

/**
 * Zod schema for workflow generation context
 */
const workflowContextSchema = z.object({
  importance: z.number().optional(),
  urgency: z.number().optional(),
  additionalNotes: z.string().optional(),
})

export const aiRouter = router({
  /**
   * Generic AI call for chat and amendments
   * Supports multi-turn conversations with system prompts
   */
  callAI: protectedProcedure
    .input(aiCallOptionsSchema)
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.callAI(input)
    }),

  /**
   * Extract tasks from brainstorming text
   * Parses natural language into structured task objects
   */
  extractTasksFromBrainstorm: protectedProcedure
    .input(z.object({
      brainstormText: z.string(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.extractTasksFromBrainstorm(input.brainstormText)
    }),

  /**
   * Extract workflows from brainstorming text
   * Identifies async patterns, dependencies, and wait times
   */
  extractWorkflowsFromBrainstorm: protectedProcedure
    .input(z.object({
      brainstormText: z.string(),
      jobContext: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.extractWorkflowsFromBrainstorm(
        input.brainstormText,
        input.jobContext,
      )
    }),

  /**
   * Generate detailed workflow steps from a task description
   */
  generateWorkflowSteps: protectedProcedure
    .input(z.object({
      taskDescription: z.string(),
      context: workflowContextSchema.optional(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.generateWorkflowSteps(input.taskDescription, input.context)
    }),

  /**
   * Enhance task details with AI suggestions
   */
  enhanceTaskDetails: protectedProcedure
    .input(z.object({
      taskName: z.string(),
      currentDetails: taskEnhanceContextSchema.optional(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.enhanceTaskDetails(input.taskName, input.currentDetails)
    }),

  /**
   * Get contextual questions to gather more information about a task
   */
  getContextualQuestions: protectedProcedure
    .input(z.object({
      taskName: z.string(),
      taskDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.getContextualQuestions(input.taskName, input.taskDescription)
    }),

  /**
   * Get job-specific contextual questions for workflow understanding
   */
  getJobContextualQuestions: protectedProcedure
    .input(z.object({
      brainstormText: z.string(),
      jobContext: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.getJobContextualQuestions(input.brainstormText, input.jobContext)
    }),

  /**
   * Extract work schedule from voice description (single day)
   */
  extractScheduleFromVoice: protectedProcedure
    .input(z.object({
      voiceText: z.string(),
      targetDate: z.string(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.extractScheduleFromVoice(input.voiceText, input.targetDate)
    }),

  /**
   * Extract multi-day work schedule from voice description
   */
  extractMultiDayScheduleFromVoice: protectedProcedure
    .input(z.object({
      voiceText: z.string(),
      startDate: z.string(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.extractMultiDayScheduleFromVoice(input.voiceText, input.startDate)
    }),

  /**
   * Extract jargon terms from job context
   */
  extractJargonTerms: protectedProcedure
    .input(z.object({
      contextText: z.string(),
    }))
    .mutation(async ({ input }) => {
      const aiService = getAIService()
      return aiService.extractJargonTerms(input.contextText)
    }),
})

export type AIRouter = typeof aiRouter
