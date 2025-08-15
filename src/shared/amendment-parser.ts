import {
  Amendment,
  AmendmentResult,
  AmendmentContext,
  AmendmentTarget,
  AmendmentType,
  EntityType,
  TaskStatus,
  StatusUpdate,
  TimeLog,
  NoteAddition,
  DurationChange,
  ParsedTimePhrase,
  ParsedIntent,
} from './amendment-types'
import { getAIService } from './ai-service'

/**
 * Service for parsing voice transcriptions into structured amendments
 * Uses Claude AI for natural language understanding with pattern matching as fallback
 */
export class AmendmentParser {
  private useAI: boolean = true
  // Common patterns for different amendment types
  private readonly STATUS_PATTERNS = [
    /(?:mark|set|update|change)\s+(.+?)\s+(?:as|to)\s+(complete[d]?|done|finished|in[- ]progress|paused|not[- ]started)/i,
    /(?:i\s+)?(?:just\s+)?(?:finished|completed|done with)\s+(?:the\s+)?(.+)/i,
    /(?:i\s+)?(?:just\s+)?(?:started|paused)\s+(?:working on\s+)?(?:the\s+)?(.+)/i,
    /(.+?)\s+is\s+(?:now\s+)?(complete[d]?|done|finished|in[- ]progress|paused)/i,
  ]

  private readonly TIME_LOG_PATTERNS = [
    /(?:i\s+)?(?:spent|worked)\s+(.+?)\s+(?:on|for)\s+(?:the\s+)?(.+)/i,
    /(?:worked\s+on)\s+(.+?)\s+(?:for|from)\s+(.+)/i,
    /(?:the\s+)?(.+?)\s+took\s+(.+?)(?:\s+to complete)?/i,
    /(?:the\s+)?(.+?)\s+(?:ran|went)\s+(.+?)\s+over/i,
  ]

  private readonly NOTE_PATTERNS = [
    /(?:add\s+)?note(?:\s+to\s+(.+?))?:\s*(.+)/i,
    /(?:add|update|set)\s+(?:a\s+)?(?:note|comment|memo)\s+(?:to|for|on)\s+(.+?):\s*(.+)/i,
    /(.+?):\s+(.+)/i,  // Simple pattern: "Task name: note content"
  ]

  private readonly DURATION_PATTERNS = [
    /(?:change|update|set)\s+(?:the\s+)?(?:duration|time)\s+(?:of\s+)?(.+?)\s+(?:to|from)\s+(.+?)(?:\s+to\s+(.+))?/i,
    /(.+?)\s+(?:will|should)\s+take\s+(.+?)(?:\s+not\s+(.+))?/i,
    /(.+?)\s+(?:is|needs)\s+(.+?)(?:\s+instead of\s+(.+))?/i,
  ]

  // Time parsing patterns
  private readonly TIME_UNITS: Record<string, number> = {
    minute: 1,
    minutes: 1,
    min: 1,
    mins: 1,
    hour: 60,
    hours: 60,
    hr: 60,
    hrs: 60,
    day: 480,  // 8 hours
    days: 480,
  }

  constructor(options?: { useAI?: boolean }) {
    // Always use AI for real usage, only disable for testing
    this.useAI = options?.useAI ?? true
  }

  /**
   * Parse a voice transcription into structured amendments
   */
  async parseTranscription(
    transcription: string,
    context: AmendmentContext,
  ): Promise<AmendmentResult> {
    // Only use Claude AI - no fallback to pattern matching
    // Pattern matching is too limited for complex workflow modifications
    if (!this.useAI) {
      // Only for testing - use simple pattern matching
      return this.parseWithPatterns(transcription, context)
    }

    try {
      return await this.parseWithAI(transcription, context)
    } catch (error) {
      console.error('AI parsing failed:', error)
      return {
        amendments: [],
        transcription,
        confidence: 0,
        warnings: [`Failed to parse: ${error instanceof Error ? error.message : 'Unknown error'}`],
        needsClarification: ['Please try rephrasing your request more clearly'],
      }
    }
  }

  /**
   * Parse amendments using Claude AI for natural language understanding
   */
  private async parseWithAI(
    transcription: string,
    context: AmendmentContext,
  ): Promise<AmendmentResult> {
    const aiService = getAIService()

    // Build context information
    const taskList = context.recentTasks.map(t => `- ${t.name} (ID: ${t.id})`).join('\n')
    const workflowList = context.recentWorkflows.map(w => `- ${w.name} (ID: ${w.id})`).join('\n')
    const activeInfo: string[] = []
    if (context.activeTaskId) {
      const activeTask = context.recentTasks.find(t => t.id === context.activeTaskId)
      if (activeTask) activeInfo.push(`Active Task: ${activeTask.name}`)
    }
    if (context.activeWorkflowId) {
      const activeWorkflow = context.recentWorkflows.find(w => w.id === context.activeWorkflowId)
      if (activeWorkflow) activeInfo.push(`Active Workflow: ${activeWorkflow.name}`)
    }

    // Build job context information for better understanding
    let jobContextInfo = ''
    if (context.jobContexts && context.jobContexts.length > 0) {
      const primaryContext = context.jobContexts[0]
      if (primaryContext.role) {
        jobContextInfo += `\nUser Role: ${primaryContext.role}\n`
      }
      if (primaryContext.context) {
        jobContextInfo += `Job Context: ${primaryContext.context}\n`
      }
      if (primaryContext.jargonDictionary) {
        const jargon = Object.entries(primaryContext.jargonDictionary)
          .map(([term, def]) => `  - ${term}: ${def}`)
          .join('\n')
        if (jargon) {
          jobContextInfo += `Domain-Specific Terms:\n${jargon}\n`
        }
      }
    }

    // Log the context for debugging
    console.log('Amendment Parser Context:', {
      transcription,
      tasksCount: context.recentTasks.length,
      workflowsCount: context.recentWorkflows.length,
      activeTaskId: context.activeTaskId,
      activeWorkflowId: context.activeWorkflowId,
    })

    const prompt = `You are parsing voice amendments for a task management system. Extract structured amendments from the transcription.

Transcription: "${transcription}"

Context:
Recent Tasks:
${taskList || 'No recent tasks'}

Recent Workflows:
${workflowList || 'No recent workflows'}

${activeInfo.join('\n')}
${jobContextInfo}

IMPORTANT: Focus on understanding the user's intent and creating actionable amendments.

Parse the transcription into one or more amendments. Common patterns:

1. STATUS UPDATE: Marking tasks/workflows as complete, in progress, waiting, or not started
   - "kick off X", "start X", "begin X" → status: "in_progress" 
   - "finish X", "complete X", "done with X" → status: "completed"
   - "pause X", "stop X", "waiting on X" → status: "waiting"
   - For workflows: "kick off the deployment workflow" → mark workflow as in_progress
   
2. TIME LOG: Recording time spent
   - "spent 2 hours on X", "worked on X for 30 minutes"
   - "the testing step took 45 minutes" → log time to specific step
   
3. NOTE ADDITION: Adding notes or comments
   - "add note: X", "X is blocked by Y"
   - "waiting for approval" → add as note to active item
   
4. DURATION CHANGE: Updating estimated duration
   - "X will take 3 hours not 2", "X needs more time"
   
5. STEP ADDITION: Adding new steps to workflows (advanced)
   - "add a code review step after implementation"
   - Break into 15-60 minute granular steps
   - Wire dependencies logically

MATCHING RULES:
- "this", "it", "current" → refer to active task/workflow from context
- Use fuzzy matching for names (e.g., "API" matches "API Implementation")
- "workflow"/"process" → items in Recent Workflows
- "task" → items in Recent Tasks
- If ambiguous, prefer the active context

Return ONLY a JSON object with this exact structure:
{
  "amendments": [
    {
      "type": "status_update",
      "target": {
        "type": "task",
        "id": "task-id",
        "name": "Task Name",
        "confidence": 0.9
      },
      "newStatus": "completed"
    }
  ],
  "confidence": 0.85,
  "warnings": [],
  "needsClarification": []
}

Amendment types and their required fields:
- status_update: type, target, newStatus ("in_progress", "completed", "waiting", "not_started"), stepName (optional for workflow steps)
- time_log: type, target, duration (in minutes), stepName (optional for logging time to specific workflow step)
- note_addition: type, target, note, append (boolean, default true), stepName (optional)
- duration_change: type, target, newDuration (in minutes), stepName (optional for changing step duration)
- step_addition: type, workflowTarget, stepName, duration, stepType ("focused"/"admin"), afterStep/beforeStep (optional)

CRITICAL: For step_addition, use "stepType" NOT "type" for the task type. The "type" field must always be "step_addition".

Examples:
- "kick off the deployment workflow" → status_update to mark workflow in_progress
- "the database migration step took 3 hours" → time_log with duration: 180 and stepName: "database migration"
- "add a code review step after implementation" → step_addition with stepType: "focused", afterStep: "implementation"
- "the testing step will take longer, maybe 2 hours" → duration_change with stepName: "testing", newDuration: 120
- "finished the API design step" → status_update with stepName: "API design", newStatus: "completed"
- "spent 45 minutes on the deployment step" → time_log with stepName: "deployment", duration: 45

IMPORTANT: 
- For workflow modifications, always include the stepName field when referring to specific steps
- When adding steps, break them down into granular tasks (15-60 minutes each)
- Always return at least one amendment if you can understand the intent
- If the user mentions a workflow step, parse it as an operation on that specific step`

    try {
      const response = await (aiService as any).anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 2000,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      console.log('Claude raw response:', content.text)

      // Extract JSON from response (may be wrapped in ```json...```)
      let jsonText = content.text.trim()

      // Remove markdown code block if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.substring(7) // Remove ```json
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.substring(3) // Remove ```
      }

      if (jsonText.endsWith('```')) {
        jsonText = jsonText.substring(0, jsonText.length - 3) // Remove trailing ```
      }

      jsonText = jsonText.trim()

      // Now extract the JSON object
      const jsonStart = jsonText.indexOf('{')
      const jsonEnd = jsonText.lastIndexOf('}')

      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1)
      }

      console.log('Extracted JSON:', jsonText)

      const result = JSON.parse(jsonText) as AmendmentResult
      result.transcription = transcription

      // Validate and enhance the result
      if (!result.amendments) result.amendments = []
      if (typeof result.confidence !== 'number') result.confidence = 0.5

      console.log('Parsed amendment result:', result)
      return result
    } catch (error) {
      console.error('Error parsing with AI:', error)
      // Return a more informative error result instead of throwing
      return {
        amendments: [],
        transcription,
        confidence: 0,
        warnings: [`Failed to parse: ${error instanceof Error ? error.message : 'Unknown error'}`],
        needsClarification: ['Please try rephrasing your request more clearly'],
      }
    }
  }

  /**
   * Fallback pattern-based parsing (original implementation)
   */
  private parseWithPatterns(
    transcription: string,
    context: AmendmentContext,
  ): AmendmentResult {
    const amendments: Amendment[] = []
    const warnings: string[] = []
    const needsClarification: string[] = []

    // Clean and normalize the transcription
    const normalized = this.normalizeText(transcription)

    // Try to parse different amendment types
    const statusUpdate = this.parseStatusUpdate(normalized, context)
    if (statusUpdate) {
      amendments.push(statusUpdate)
    }

    const timeLog = this.parseTimeLog(normalized, context)
    if (timeLog) {
      amendments.push(timeLog)
    }

    const noteAddition = this.parseNoteAddition(normalized, context)
    if (noteAddition) {
      amendments.push(noteAddition)
    }

    const durationChange = this.parseDurationChange(normalized, context)
    if (durationChange) {
      amendments.push(durationChange)
    }

    // If no amendments were parsed, try to understand the intent
    if (amendments.length === 0) {
      const intent = this.parseIntent(normalized)
      if (intent.confidence < 0.5) {
        needsClarification.push('Could not understand the request. Please try rephrasing.')
      } else {
        warnings.push(`Understood "${intent.action}" but couldn't parse specific changes.`)
      }
    }

    // Calculate overall confidence
    const confidence = amendments.length > 0
      ? amendments.reduce((sum, a) => sum + ('target' in a ? a.target.confidence : 0.5), 0) / amendments.length
      : 0

    return {
      amendments,
      transcription,
      confidence,
      warnings: warnings.length > 0 ? warnings : undefined,
      needsClarification: needsClarification.length > 0 ? needsClarification : undefined,
    }
  }

  /**
   * Parse a status update from the transcription
   */
  private parseStatusUpdate(text: string, context: AmendmentContext): StatusUpdate | null {
    // Check for finished/completed patterns
    if (text.match(/(?:i\s+)?(?:just\s+)?(?:finished|completed|done with)\s+/i)) {
      const match = text.match(/(?:i\s+)?(?:just\s+)?(?:finished|completed|done with)\s+(?:the\s+)?(.+)/i)
      if (match) {
        const entityName = match[1]?.trim()
        if (entityName) {
          const target = this.findTarget(entityName, context)
          if (target) {
            return {
              type: AmendmentType.StatusUpdate,
              target,
              newStatus: TaskStatus.Completed,
              stepName: this.extractStepName(entityName),
            }
          }
        }
      }
    }

    // Check for started patterns
    if (text.match(/(?:i\s+)?(?:just\s+)?started/i)) {
      const match = text.match(/(?:i\s+)?(?:just\s+)?started\s+(?:working on\s+)?(?:the\s+)?(.+)/i)
      if (match) {
        const entityName = match[1]?.trim()
        if (entityName) {
          const target = this.findTarget(entityName, context)
          if (target) {
            return {
              type: AmendmentType.StatusUpdate,
              target,
              newStatus: TaskStatus.InProgress,
              stepName: this.extractStepName(entityName),
            }
          }
        }
      }
    }

    // Check for waiting/paused patterns
    if (text.match(/(?:paused|waiting)/i)) {
      const match = text.match(/(?:i\s+)?(?:just\s+)?(?:paused|put on hold|waiting on)\s+(?:the\s+)?(.+)/i)
      if (match) {
        const entityName = match[1]?.trim()
        if (entityName) {
          const target = this.findTarget(entityName, context)
          if (target) {
            return {
              type: AmendmentType.StatusUpdate,
              target,
              newStatus: TaskStatus.Waiting,
              stepName: this.extractStepName(entityName),
            }
          }
        }
      }
    }

    // Try other patterns
    for (const pattern of this.STATUS_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        const entityName = match[1]?.trim()
        const statusText = match[2]?.trim() || match[1]?.trim()

        if (!entityName) continue

        const target = this.findTarget(entityName, context)
        const newStatus = this.parseStatus(statusText)

        if (target && newStatus) {
          return {
            type: AmendmentType.StatusUpdate,
            target,
            newStatus,
            stepName: this.extractStepName(entityName),
          }
        }
      }
    }
    return null
  }

  /**
   * Parse a time log from the transcription
   */
  private parseTimeLog(text: string, context: AmendmentContext): TimeLog | null {
    // Try specific patterns first

    // Pattern: "worked on X for Y"
    let match = text.match(/(?:worked\s+on)\s+(.+?)\s+(?:for|from)\s+(.+)/i)
    if (match) {
      const entityName = match[1]?.trim()
      const timePhrase = match[2]?.trim()
      if (entityName && timePhrase) {
        const target = this.findTarget(entityName, context)
        const time = this.parseTimePhrase(timePhrase)
        if (target && time.duration) {
          return {
            type: AmendmentType.TimeLog,
            target,
            duration: time.duration,
            date: time.date,
            startTime: time.startTime,
            endTime: time.endTime,
          }
        }
      }
    }

    // Pattern: "spent X on Y" or "worked X on Y"
    match = text.match(/(?:i\s+)?(?:spent|worked)\s+(.+?)\s+(?:on|for)\s+(?:the\s+)?(.+)/i)
    if (match) {
      const timePhrase = match[1]?.trim()
      const entityName = match[2]?.trim()
      if (timePhrase && entityName) {
        const target = this.findTarget(entityName, context)
        const time = this.parseTimePhrase(timePhrase)
        if (target && time.duration) {
          return {
            type: AmendmentType.TimeLog,
            target,
            duration: time.duration,
            date: time.date,
            startTime: time.startTime,
            endTime: time.endTime,
          }
        }
      }
    }

    // Pattern: "X took Y"
    match = text.match(/(?:the\s+)?(.+?)\s+took\s+(.+?)(?:\s+to\s+complete)?$/i)
    if (match) {
      const entityName = match[1]?.trim()
      const timePhrase = match[2]?.trim()
      if (entityName && timePhrase) {
        const target = this.findTarget(entityName, context)
        const time = this.parseTimePhrase(timePhrase)
        if (target && time.duration) {
          return {
            type: AmendmentType.TimeLog,
            target,
            duration: time.duration,
            date: time.date,
            startTime: time.startTime,
            endTime: time.endTime,
          }
        }
      }
    }

    return null
  }

  /**
   * Parse a note addition from the transcription
   */
  private parseNoteAddition(text: string, context: AmendmentContext): NoteAddition | null {
    for (const pattern of this.NOTE_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        const entityName = match[1]?.trim()
        const noteContent = match[2]?.trim()

        if (!noteContent) continue

        // If no entity specified, use active context
        const target = entityName
          ? this.findTarget(entityName, context)
          : this.getActiveTarget(context)

        if (target) {
          return {
            type: AmendmentType.NoteAddition,
            target,
            note: noteContent,
            append: true,
          }
        }
      }
    }
    return null
  }

  /**
   * Parse a duration change from the transcription
   */
  private parseDurationChange(text: string, context: AmendmentContext): DurationChange | null {
    for (const pattern of this.DURATION_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        const entityName = match[1]?.trim()
        const newDurationText = match[2]?.trim()
        const oldDurationText = match[3]?.trim()

        if (!entityName || !newDurationText) continue

        const target = this.findTarget(entityName, context)
        const newTime = this.parseTimePhrase(newDurationText)
        const oldTime = oldDurationText ? this.parseTimePhrase(oldDurationText) : null

        if (target && newTime.duration) {
          return {
            type: AmendmentType.DurationChange,
            target,
            currentDuration: oldTime?.duration,
            newDuration: newTime.duration,
          }
        }
      }
    }
    return null
  }

  /**
   * Find the target entity (task/workflow/step) from a name
   */
  private findTarget(name: string, context: AmendmentContext): AmendmentTarget | null {
    const normalizedName = name.toLowerCase()

    // Check if it's referring to a step
    const stepMatch = normalizedName.match(/(?:step\s+)?(.+?)\s+step/i)
    if (stepMatch) {
      return this.findStepTarget(stepMatch[1], context)
    }

    // First check active context
    if (context.activeTaskId || context.activeWorkflowId) {
      const activeMatch = this.checkActiveContext(normalizedName, context)
      if (activeMatch) return activeMatch
    }

    // Then check recent items with fuzzy matching
    const candidates: Array<{ id: string; name: string; type: EntityType; score: number }> = []

    // Check recent tasks
    context.recentTasks.forEach(task => {
      const score = this.fuzzyMatch(normalizedName, task.name.toLowerCase())
      if (score > 0.5) {
        candidates.push({ ...task, type: EntityType.Task, score })
      }
    })

    // Check recent workflows
    context.recentWorkflows.forEach(workflow => {
      const score = this.fuzzyMatch(normalizedName, workflow.name.toLowerCase())
      if (score > 0.5) {
        candidates.push({ ...workflow, type: EntityType.Workflow, score })
      }
    })

    // Sort by score and return best match
    candidates.sort((a, b) => b.score - a.score)

    if (candidates.length > 0) {
      const best = candidates[0]
      return {
        type: best.type,
        id: best.id,
        name: best.name,
        confidence: best.score,
        alternatives: candidates.slice(1, 4).map(c => ({
          id: c.id,
          name: c.name,
          confidence: c.score,
        })),
      }
    }

    // If no match found, return with low confidence
    return {
      type: EntityType.Task,
      name,
      confidence: 0.2,
    }
  }

  /**
   * Find a workflow step target
   */
  private findStepTarget(stepName: string, context: AmendmentContext): AmendmentTarget | null {
    // This would need access to workflow steps
    // For now, return a step target with the workflow context
    return {
      type: EntityType.Step,
      name: stepName,
      confidence: 0.7,
    }
  }

  /**
   * Get the currently active target from context
   */
  private getActiveTarget(context: AmendmentContext): AmendmentTarget | null {
    if (context.activeTaskId) {
      const task = context.recentTasks.find(t => t.id === context.activeTaskId)
      if (task) {
        return {
          type: EntityType.Task,
          id: task.id,
          name: task.name,
          confidence: 1.0,
        }
      }
    }

    if (context.activeWorkflowId) {
      const workflow = context.recentWorkflows.find(w => w.id === context.activeWorkflowId)
      if (workflow) {
        return {
          type: EntityType.Workflow,
          id: workflow.id,
          name: workflow.name,
          confidence: 1.0,
        }
      }
    }

    return null
  }

  /**
   * Check if the name refers to the active context
   */
  private checkActiveContext(name: string, context: AmendmentContext): AmendmentTarget | null {
    const activeWords = ['this', 'current', 'it', 'that']
    if (activeWords.some(word => name.includes(word))) {
      return this.getActiveTarget(context)
    }
    return null
  }

  /**
   * Parse a time phrase into duration and/or timestamps
   */
  private parseTimePhrase(phrase: string): ParsedTimePhrase {
    const result: ParsedTimePhrase = { raw: phrase }

    // Parse duration (e.g., "2 hours", "30 minutes")
    const durationMatch = phrase.match(/(\d+(?:\.\d+)?)\s*(\w+)/i)
    if (durationMatch) {
      const value = parseFloat(durationMatch[1])
      const unit = durationMatch[2].toLowerCase()

      for (const [key, multiplier] of Object.entries(this.TIME_UNITS)) {
        if (unit.startsWith(key.substring(0, 3))) {
          result.duration = Math.round(value * multiplier)
          break
        }
      }
    }

    // Parse time range (e.g., "from 2 to 4 PM" or "2pm to 4pm")
    const rangeMatch = phrase.match(/(?:from\s+)?(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)\s+to\s+(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)/i)
    if (rangeMatch) {
      result.startTime = this.parseTime(rangeMatch[1])
      result.endTime = this.parseTime(rangeMatch[2])
      if (result.startTime && result.endTime) {
        result.duration = (result.endTime.getTime() - result.startTime.getTime()) / (1000 * 60)
      }
    }

    // Parse relative dates
    if (phrase.includes('today')) {
      result.date = new Date()
    } else if (phrase.includes('yesterday')) {
      result.date = new Date()
      result.date.setDate(result.date.getDate() - 1)
    }

    return result
  }

  /**
   * Parse a time string into a Date
   */
  private parseTime(timeStr: string): Date | undefined {
    const now = new Date()
    const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i)

    if (match) {
      let hours = parseInt(match[1])
      const minutes = parseInt(match[2] || '0')
      const meridiem = match[3]?.toLowerCase()

      if (meridiem === 'pm' && hours < 12) hours += 12
      if (meridiem === 'am' && hours === 12) hours = 0

      const date = new Date()
      date.setHours(hours, minutes, 0, 0)
      return date
    }

    return undefined
  }

  /**
   * Parse status text into a structured status
   */
  private parseStatus(text: string): TaskStatus | null {
    const normalized = text.toLowerCase()

    if (normalized.includes('complet') || normalized.includes('done') || normalized.includes('finish')) {
      return TaskStatus.Completed
    }
    if (normalized.includes('progress') || normalized.includes('start') || normalized.includes('work')) {
      return TaskStatus.InProgress
    }
    if (normalized.includes('pause') || normalized.includes('stop') || normalized.includes('hold') || normalized.includes('wait')) {
      return TaskStatus.Waiting
    }
    if (normalized.includes('not') || normalized.includes('reset') || normalized.includes('todo')) {
      return TaskStatus.NotStarted
    }

    return null
  }

  /**
   * Extract step name from a phrase
   */
  private extractStepName(phrase: string): string | undefined {
    const stepMatch = phrase.match(/(?:the\s+)?(.+?)\s+step/i)
    return stepMatch ? stepMatch[1] : undefined
  }

  /**
   * Parse general intent from text
   */
  private parseIntent(text: string): ParsedIntent {
    const verbs = ['mark', 'set', 'update', 'change', 'add', 'remove', 'delete', 'finish', 'complete', 'start', 'pause', 'log', 'track', 'note']
    const words = text.toLowerCase().split(/\s+/)

    let action = ''
    let confidence = 0

    for (const verb of verbs) {
      if (words.includes(verb)) {
        action = verb
        confidence = 0.7
        break
      }
    }

    if (!action && words.length > 0) {
      action = words[0]
      confidence = 0.3
    }

    return {
      action,
      entity: words.slice(1).join(' '),
      attributes: {},
      confidence,
    }
  }

  /**
   * Fuzzy string matching
   */
  private fuzzyMatch(str1: string, str2: string): number {
    // Simple fuzzy matching - can be improved with Levenshtein distance
    const words1 = str1.toLowerCase().split(/\s+/)
    const words2 = str2.toLowerCase().split(/\s+/)

    let matches = 0
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
          matches++
        }
      }
    }

    const maxWords = Math.max(words1.length, words2.length)
    return maxWords > 0 ? matches / maxWords : 0
  }

  /**
   * Normalize text for parsing
   */
  private normalizeText(text: string): string {
    return text
      .replace(/(\d)\.(\d)/g, '$1DECIMAL$2')  // Preserve decimal points in numbers
      .replace(/[.,!?]/g, '')  // Remove punctuation
      .replace(/DECIMAL/g, '.')  // Restore decimal points
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim()
  }
}
