import Anthropic from '@anthropic-ai/sdk'
import { ChatMessageRole, TaskStep, AICallOptions, Logger, defaultLogger } from '../types.js'

/**
 * Service for AI-powered task creation and workflow generation
 */
export class AIService {
  private anthropic: Anthropic
  private logger: Logger

  constructor(apiKey: string, logger: Logger = defaultLogger) {
    this.anthropic = new Anthropic({ apiKey })
    this.logger = logger
  }

  /**
   * Safely extract text from Anthropic response content
   */
  private extractTextFromResponse(response: Anthropic.Message): string {
    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }
    return content.text
  }

  /**
   * Extract tasks from brainstorming text
   */
  async extractTasksFromBrainstorm(brainstormText: string): Promise<{
    tasks: Array<{
      name: string
      description: string
      estimatedDuration: number
      importance: number
      urgency: number
      type: string
      deadline?: string
      deadlineType?: 'hard' | 'soft'
      cognitiveComplexity?: 1 | 2 | 3 | 4 | 5
      needsMoreInfo?: boolean
    }>
    summary: string
  }> {
    const prompt = `
You are a productivity expert helping someone organize their work. Analyze the following brainstorm text and extract discrete, actionable tasks.

Brainstorm text: "${brainstormText}"
Today's date: ${new Date().toISOString().split('T')[0]}

For each task you identify:
1. Give it a clear, actionable name (verb + object format)
2. Provide a brief description of what needs to be done
3. Estimate duration in minutes (be realistic)
4. Rate importance (1-10): How critical is this to goals?
5. Rate urgency (1-10): How time-sensitive is this?
6. Classify type: "focused" (deep work, coding, writing) or "admin" (meetings, emails, simple tasks)
7. Extract deadlines if mentioned (e.g., "by Friday", "end of month", "tomorrow")
8. Determine if deadline is "hard" (must meet) or "soft" (target)
9. Rate cognitive complexity (1-5): 1=trivial, 2=simple, 3=moderate, 4=complex, 5=very complex
10. Flag if you need more information to properly scope the task

Return your response as a JSON object with this structure:
{
  "summary": "Brief overview of the brainstorm content",
  "tasks": [
    {
      "name": "Task name",
      "description": "What needs to be done",
      "estimatedDuration": 60,
      "importance": 7,
      "urgency": 5,
      "type": "focused",
      "deadline": "2024-01-20T17:00:00Z",
      "deadlineType": "hard",
      "cognitiveComplexity": 3,
      "needsMoreInfo": false
    }
  ]
}

Be thorough but realistic. Break down complex items into manageable tasks.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      })

      let jsonText = this.extractTextFromResponse(response).trim()
      const jsonStart = jsonText.indexOf('{')
      const jsonEnd = jsonText.lastIndexOf('}')

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1)
      }

      return JSON.parse(jsonText)
    } catch (error) {
      this.logger.error('Error extracting tasks from brainstorm:', error)
      throw new Error(`Failed to extract tasks: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract async workflows from brainstorming text
   */
  async extractWorkflowsFromBrainstorm(brainstormText: string, jobContext?: string): Promise<{
    workflows: Array<{
      name: string
      description: string
      importance: number
      urgency: number
      type: string
      steps: Omit<TaskStep, 'id' | 'status'>[]
      totalDuration: number
      earliestCompletion: string
      worstCaseCompletion: string
      notes: string
    }>
    standaloneTasks: Array<{
      name: string
      description: string
      estimatedDuration: number
      importance: number
      urgency: number
      type: string
      needsMoreInfo?: boolean
    }>
    summary: string
  }> {
    const contextInfo = jobContext ? `\n\nJob Context: ${jobContext}` : ''

    const prompt = `
You are an expert at understanding async workflows and dependencies. Analyze the following brainstorm text and extract workflows with natural language dependency interpretation.

Brainstorm text: "${brainstormText}"${contextInfo}

Look for workflow patterns like:
- "run X then wait for Y, then check Z" → sequence with async wait
- "start A, when it's done do B" → dependency relationship
- "trigger workflow, wait hours, verify results" → async workflow with wait times

For each workflow you identify:
1. Break into logical steps with realistic durations (15-120 min each)
2. Identify async wait times (time waiting for external processes)
3. Model dependencies between steps using EXACT step names
4. Calculate timeline including async waits
5. Estimate importance (1-10) and urgency (1-10)

Return as JSON:
{
  "summary": "Overview of brainstorm content",
  "workflows": [
    {
      "name": "Workflow name",
      "description": "What this workflow accomplishes",
      "importance": 8,
      "urgency": 6,
      "type": "focused",
      "steps": [
        {
          "name": "Step name",
          "duration": 30,
          "type": "focused",
          "dependsOn": [],
          "asyncWaitTime": 0
        }
      ],
      "totalDuration": 300,
      "earliestCompletion": "2 hours active + 4 hour wait",
      "worstCaseCompletion": "12 hours",
      "notes": "Strategy notes"
    }
  ],
  "standaloneTasks": []
}
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }],
      })

      let jsonText = this.extractTextFromResponse(response).trim()

      // Handle markdown code blocks
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (codeBlockMatch?.[1]) {
        jsonText = codeBlockMatch[1].trim()
      }

      const jsonStart = jsonText.indexOf('{')
      if (jsonStart === -1) {
        throw new Error('No JSON object found in AI response')
      }

      // Find matching closing brace
      let braceCount = 0
      let inString = false
      let escapeNext = false
      let jsonEnd = -1

      for (let i = jsonStart; i < jsonText.length; i++) {
        const char = jsonText[i]
        if (escapeNext) {
          escapeNext = false
          continue
        }
        if (char === '\\') {
          escapeNext = true
          continue
        }
        if (char === '"' && !escapeNext) {
          inString = !inString
          continue
        }
        if (!inString) {
          if (char === '{' || char === '[') braceCount++
          if (char === '}' || char === ']') braceCount--
          if (braceCount === 0) {
            jsonEnd = i
            break
          }
        }
      }

      if (jsonEnd === -1) {
        throw new Error('Could not find matching closing brace')
      }

      return JSON.parse(jsonText.substring(jsonStart, jsonEnd + 1))
    } catch (error) {
      this.logger.error('Error extracting workflows from brainstorm:', error)
      throw new Error(`Failed to extract workflows: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract work schedule from voice description
   */
  async extractScheduleFromVoice(voiceText: string, targetDate: string): Promise<{
    date: string
    blocks: Array<{
      id: string
      startTime: string
      endTime: string
      type: string
      capacity?: {
        totalMinutes: number
        type: string
        splitRatio?: { focus: number; admin: number }
      }
    }>
    meetings: Array<{
      id: string
      name: string
      startTime: string
      endTime: string
      type: 'meeting' | 'break' | 'personal' | 'blocked'
    }>
    summary: string
  }> {
    const prompt = `
You are a scheduling assistant. Analyze the following voice description and extract a structured work schedule.

Voice description: "${voiceText}"
Target date: ${targetDate}

Extract:
1. Work blocks - continuous periods of available work time
2. Meetings/breaks - specific scheduled events
3. Sleep blocks - if mentioned

Return as JSON:
{
  "date": "${targetDate}",
  "blocks": [
    {
      "id": "block-1",
      "startTime": "09:00",
      "endTime": "12:00",
      "type": "mixed",
      "capacity": { "totalMinutes": 180, "type": "mixed", "splitRatio": { "focus": 0.67, "admin": 0.33 } }
    }
  ],
  "meetings": [
    { "id": "meeting-1", "name": "Team Standup", "startTime": "10:00", "endTime": "10:30", "type": "meeting" }
  ],
  "summary": "8-hour workday with 4 hours focus time"
}

Use 24-hour time format (HH:MM). Ensure blocks don't overlap with meetings.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })

      let jsonText = this.extractTextFromResponse(response).trim()
      const jsonStart = jsonText.indexOf('{')
      const jsonEnd = jsonText.lastIndexOf('}')

      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1)
      }

      return JSON.parse(jsonText)
    } catch (error) {
      this.logger.error('Error extracting schedule from voice:', error)
      throw new Error(`Failed to extract schedule: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract multi-day schedule from voice description
   */
  async extractMultiDayScheduleFromVoice(voiceText: string, startDate: string): Promise<Array<{
    date: string
    blocks: Array<{
      id: string
      startTime: string
      endTime: string
      type: string
      capacity?: { totalMinutes: number; type: string }
    }>
    meetings: Array<{
      id: string
      name: string
      startTime: string
      endTime: string
      type: 'meeting' | 'break' | 'personal' | 'blocked'
    }>
    summary: string
  }>> {
    const prompt = `
You are a scheduling assistant helping someone plan their work week.

Voice description: "${voiceText}"
Starting date: ${startDate}

Generate schedules for the next 7 days. If they mention "weekdays", apply to Mon-Fri. If "weekends", apply to Sat-Sun.

Return as JSON array:
[
  {
    "date": "YYYY-MM-DD",
    "blocks": [...],
    "meetings": [],
    "summary": "Description for this day"
  }
]

Always generate exactly 7 days with proper YYYY-MM-DD dates.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = this.extractTextFromResponse(response)
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON array from response')
      }

      return JSON.parse(jsonMatch[0])
    } catch (error) {
      this.logger.error('Error extracting multi-day schedule:', error)
      // Fall back to single day
      const singleDay = await this.extractScheduleFromVoice(voiceText, startDate)
      return [singleDay]
    }
  }

  /**
   * Generic AI call for brainstorm chat
   */
  async callAI(options: AICallOptions): Promise<{ content: string }> {
    const model = options.model || 'claude-sonnet-4-20250514'
    const maxTokens = options.maxTokens || 8000

    try {
      const apiMessages: Anthropic.MessageParam[] = [
        { role: ChatMessageRole.User, content: options.systemPrompt },
        ...options.messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ]

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        messages: apiMessages,
      })

      if (!response.content || response.content.length === 0) {
        throw new Error('Empty response from Claude API')
      }

      return { content: this.extractTextFromResponse(response) }
    } catch (error) {
      this.logger.error('Error calling AI service:', error)
      throw new Error(`AI service error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract jargon terms from context
   */
  async extractJargonTerms(contextText: string): Promise<string> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: `Based on this context, identify technical terms and jargon. Return ONLY a JSON array of terms.

Context: ${contextText}

Return format: ["term1", "term2", ...]
Limit to 15 most important terms.`,
        }],
      })

      return this.extractTextFromResponse(response).trim()
    } catch (error) {
      this.logger.error('Error extracting jargon terms:', error)
      return '[]'
    }
  }
}

// Singleton instance with lazy initialization
let aiServiceInstance: AIService | null = null

export const getAIService = (logger?: Logger): AIService => {
  if (!aiServiceInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }
    aiServiceInstance = new AIService(apiKey, logger)
  }
  return aiServiceInstance
}
