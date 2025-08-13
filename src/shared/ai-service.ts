import Anthropic from '@anthropic-ai/sdk'
import { TaskStep } from './sequencing-types'

/**
 * Service for AI-powered task creation and workflow generation
 */
export class AIService {
  private anthropic: Anthropic

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey,
    })
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
      type: 'focused' | 'admin'
      needsMoreInfo?: boolean
    }>
    summary: string
  }> {
    const prompt = `
You are a productivity expert helping someone organize their work. Analyze the following brainstorm text and extract discrete, actionable tasks.

Brainstorm text: "${brainstormText}"

For each task you identify:
1. Give it a clear, actionable name (verb + object format)
2. Provide a brief description of what needs to be done
3. Estimate duration in minutes (be realistic)
4. Rate importance (1-10): How critical is this to goals?
5. Rate urgency (1-10): How time-sensitive is this?
6. Classify type: "focused" (deep work, coding, writing) or "admin" (meetings, emails, simple tasks)
7. Flag if you need more information to properly scope the task

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
      "needsMoreInfo": false
    }
  ]
}

Be thorough but realistic. Break down complex items into manageable tasks. If something seems vague, flag it for more information.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      // Extract JSON from the response (Claude sometimes adds extra text)
      let jsonText = content.text.trim()
      const jsonStart = jsonText.indexOf('{')
      const jsonEnd = jsonText.lastIndexOf('}')

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1)
      }

      return JSON.parse(jsonText)
    } catch (error) {
      console.error('Error extracting tasks from brainstorm:', error)
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response as JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      throw new Error(`Failed to extract tasks from brainstorm text: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Extract async workflows from brainstorming text with natural language dependency understanding
   */
  async extractWorkflowsFromBrainstorm(brainstormText: string, jobContext?: string): Promise<{
    workflows: Array<{
      name: string
      description: string
      importance: number
      urgency: number
      type: 'focused' | 'admin'
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
      type: 'focused' | 'admin'
      needsMoreInfo?: boolean
    }>
    summary: string
  }> {
    const contextInfo = jobContext ? `\n\nJob Context: ${jobContext}` : ''

    const prompt = `
You are an expert at understanding async workflows and dependencies. Analyze the following brainstorm text and extract workflows with natural language dependency interpretation.

CRITICAL INSTRUCTION: Never make assumptions about unclear details. If information is ambiguous or missing:
- Mark tasks/workflows that need clarification with needsMoreInfo: true
- Add specific questions in the notes about what needs to be clarified
- Be explicit about what assumptions would need to be validated
- When durations, wait times, or dependencies are unclear, ask for clarification

Brainstorm text: "${brainstormText}"${contextInfo}

Look for workflow patterns like:
- "run X then wait for Y, then check Z" → sequence with async wait
- "start A, when it's done do B" → dependency relationship
- "trigger workflow, wait hours, verify results" → async workflow with wait times
- "submit for review, wait for feedback, address comments" → review cycles
- "launch job, check back tomorrow" → long async waits

For each workflow you identify:
1. Break into logical steps with realistic durations (15-120 min each)
2. Identify async wait times (time waiting for external processes)
3. Model dependencies between steps using step references
4. Calculate timeline including async waits
5. Consider conditional branches and retry scenarios
6. Estimate importance (1-10) and urgency (1-10) for prioritization
7. Flag any assumptions made and what clarification would help

For simple standalone tasks that don't have complex dependencies, extract them separately.

Return your response as a JSON object:
{
  "summary": "Overview of brainstorm content and workflow complexity",
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
          "duration": 60,
          "type": "focused",
          "dependsOn": [],
          "asyncWaitTime": 240,
          "conditionalBranches": null
        }
      ],
      "totalDuration": 300,
      "earliestCompletion": "2 hours active work + 4 hour wait = 6 hours total",
      "worstCaseCompletion": "Including potential retries and delays: 12 hours",
      "notes": "Strategy and considerations for this workflow. Include any assumptions made and questions that need clarification.",
      "needsMoreInfo": false
    }
  ],
  "standaloneTasks": [
    {
      "name": "Simple task name",
      "description": "What needs to be done",
      "estimatedDuration": 45,
      "importance": 6,
      "urgency": 4,
      "type": "admin",
      "needsMoreInfo": false
    }
  ]
}

Focus on understanding the async nature described in natural language. Be realistic about wait times and dependencies. Consider real-world constraints like review cycles, CI/CD pipelines, external approvals, and handoffs.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 6000,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      // Extract JSON from the response (Claude sometimes adds extra text)
      let jsonText = content.text.trim()
      const jsonStart = jsonText.indexOf('{')
      const jsonEnd = jsonText.lastIndexOf('}')

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1)
      }

      return JSON.parse(jsonText)
    } catch (error) {
      console.error('Error extracting workflows from brainstorm:', error)
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response as JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      throw new Error(`Failed to extract workflows from brainstorm text: ${error.message}`)
    }
  }

  /**
   * Extract potential jargon terms from job context
   */
  async extractJargonTerms(contextText: string): Promise<string> {
    try {
      const prompt = `Based on this job context, identify technical terms, acronyms, and industry-specific jargon that might need definition. Return ONLY a JSON array of terms (no definitions needed, just the terms themselves).

Context:
${contextText}

Return format: ["term1", "term2", "term3", ...]
Only include terms that are likely industry-specific or technical jargon, not common words.
Include acronyms, technical terms, tools, frameworks, and domain-specific concepts.
Limit to the 15 most important/frequently mentioned terms.`

      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 1000,
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

      return content.text.trim()
    } catch (error) {
      console.error('Error extracting jargon terms:', error)
      // Return empty array on error
      return '[]'
    }
  }

  /**
   * Generate detailed workflow steps from a task description
   */
  async generateWorkflowSteps(taskDescription: string, context?: {
    importance?: number
    urgency?: number
    additionalNotes?: string
  }): Promise<{
    workflowName: string
    steps: Omit<TaskStep, 'id' | 'status'>[]
    totalDuration: number
    notes: string
  }> {
    const contextInfo = context ? `
Task Importance: ${context.importance}/10
Task Urgency: ${context.urgency}/10
Additional Context: ${context.additionalNotes || 'None'}
` : ''

    const prompt = `
You are a workflow expert helping someone break down a complex task into detailed, executable steps.

Task to break down: "${taskDescription}"
${contextInfo}

Create a detailed workflow with these requirements:
1. Break the task into logical, sequential steps
2. Each step should be 15-120 minutes (be realistic about time)
3. Identify dependencies between steps
4. Consider async wait times (time waiting for external processes, reviews, etc.)
5. Classify each step as "focused" (deep work) or "admin" (coordination, communication)
6. Suggest a clear workflow name

Step dependency format: Use "step-X" where X is the 0-indexed step number (e.g., "step-0", "step-1")

Return your response as a JSON object:
{
  "workflowName": "Clear workflow name",
  "notes": "Overall workflow strategy and considerations",
  "totalDuration": 240,
  "steps": [
    {
      "name": "Step name",
      "duration": 60,
      "type": "focused",
      "dependsOn": [],
      "asyncWaitTime": 0,
      "conditionalBranches": null
    }
  ]
}

Make steps actionable and specific. Consider real-world constraints like review cycles, approvals, and external dependencies.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      return JSON.parse(content.text)
    } catch (error) {
      console.error('Error generating workflow steps:', error)
      throw new Error('Failed to generate workflow steps')
    }
  }

  /**
   * Enhance task details with AI suggestions
   */
  async enhanceTaskDetails(taskName: string, currentDetails?: {
    description?: string
    duration?: number
    importance?: number
    urgency?: number
  }): Promise<{
    suggestions: {
      description?: string
      duration?: number
      importance?: number
      urgency?: number
      type?: 'focused' | 'admin'
      tips?: string[]
    }
    confidence: number
  }> {
    const currentInfo = currentDetails ? `
Current Details:
- Description: ${currentDetails.description || 'Not provided'}
- Duration: ${currentDetails.duration || 'Not specified'} minutes
- Importance: ${currentDetails.importance || 'Not rated'}/10
- Urgency: ${currentDetails.urgency || 'Not rated'}/10
` : ''

    const prompt = `
You are a productivity consultant helping someone refine their task details.

Task: "${taskName}"
${currentInfo}

Provide suggestions to improve this task definition:
1. Enhanced description (if current one is vague)
2. Realistic duration estimate in minutes
3. Importance rating (1-10): How critical to overall goals?
4. Urgency rating (1-10): How time-sensitive?
5. Type classification: "focused" (deep work) or "admin" (coordination)
6. Helpful tips for execution

Return as JSON:
{
  "suggestions": {
    "description": "Clear, actionable description",
    "duration": 90,
    "importance": 7,
    "urgency": 5,
    "type": "focused",
    "tips": ["Helpful tip 1", "Helpful tip 2"]
  },
  "confidence": 85
}

Confidence is 0-100 based on how clear and specific the original task was.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      return JSON.parse(content.text)
    } catch (error) {
      console.error('Error enhancing task details:', error)
      throw new Error('Failed to enhance task details')
    }
  }

  /**
   * Get job-specific contextual questions for better async workflow understanding
   */
  async getJobContextualQuestions(brainstormText: string, jobContext?: string): Promise<{
    questions: Array<{
      question: string
      type: 'text' | 'number' | 'choice'
      choices?: string[]
      purpose: string
      priority: 'high' | 'medium' | 'low'
    }>
    suggestedJobContext?: string
  }> {
    const contextInfo = jobContext ? `\n\nCurrent Job Context: ${jobContext}` : ''

    const prompt = `
You are helping someone clarify their async work patterns and job context to better understand their workflow needs.

Brainstorm text: "${brainstormText}"${contextInfo}

Based on the brainstorm content, generate strategic questions that would help you understand:
- Their specific job role and async work patterns
- Common external dependencies and wait times in their work
- Typical review cycles, approval processes, and handoff patterns
- Tools, systems, and processes they work with
- Timeline constraints and scheduling patterns
- Collaboration and communication patterns

Focus on async workflow aspects like:
- How long do reviews typically take?
- What external systems do they wait for?
- What's their role in larger processes?
- How do they handle dependencies and handoffs?

Return as JSON:
{
  "questions": [
    {
      "question": "What's your role and what kind of async processes are typical in your work?",
      "type": "text",
      "purpose": "Understand job context and async patterns",
      "priority": "high"
    },
    {
      "question": "How long do code reviews typically take in your organization?",
      "type": "choice",
      "choices": ["< 1 hour", "1-4 hours", "4-24 hours", "1-3 days", "3+ days"],
      "purpose": "Calibrate async wait time expectations",
      "priority": "high"
    }
  ],
  "suggestedJobContext": "Based on brainstorm, appears to be a software engineer working with CI/CD pipelines and code review processes"
}

Make questions specific to their apparent work patterns. Prioritize questions that will most improve workflow timeline accuracy.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      // Extract JSON from the response
      let jsonText = content.text.trim()
      const jsonStart = jsonText.indexOf('{')
      const jsonEnd = jsonText.lastIndexOf('}')

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1)
      }

      return JSON.parse(jsonText)
    } catch (error) {
      console.error('Error getting job contextual questions:', error)
      throw new Error('Failed to generate job contextual questions')
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
      type: 'focused' | 'admin' | 'mixed'
      capacity?: {
        focusMinutes: number
        adminMinutes: number
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
You are a scheduling assistant helping someone plan their work day. Analyze the following voice description and extract a structured work schedule.

Voice description: "${voiceText}"
Target date: ${targetDate}

Extract:
1. Work blocks - continuous periods of available work time
2. Meetings/breaks - specific scheduled events
3. Time allocations - how much focus vs admin time is needed

For work blocks:
- If they mention specific focus/admin time needs, create "mixed" blocks with capacity
- If they specify a block for only one type, use "focused" or "admin"
- Infer reasonable time blocks based on typical work patterns if not explicit

For meetings:
- Extract any mentioned meetings, standups, breaks, lunch, etc.
- Use appropriate types: "meeting" for work meetings, "break" for breaks/lunch, "personal" for personal time

Return as JSON:
{
  "date": "${targetDate}",
  "blocks": [
    {
      "id": "block-1",
      "startTime": "09:00",
      "endTime": "12:00",
      "type": "mixed",
      "capacity": {
        "focusMinutes": 120,
        "adminMinutes": 60
      }
    }
  ],
  "meetings": [
    {
      "id": "meeting-1",
      "name": "Team Standup",
      "startTime": "10:00",
      "endTime": "10:30",
      "type": "meeting"
    }
  ],
  "summary": "8-hour workday with 4 hours focus time, 2 hours admin, standup at 10am, and lunch break"
}

Important:
- Use 24-hour time format (HH:MM)
- Ensure blocks don't overlap with meetings
- Split blocks around meetings if needed
- Generate unique IDs for each block/meeting
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      // Extract JSON from the response
      let jsonText = content.text.trim()
      const jsonStart = jsonText.indexOf('{')
      const jsonEnd = jsonText.lastIndexOf('}')

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1)
      }

      return JSON.parse(jsonText)
    } catch (error) {
      console.error('Error extracting schedule from voice:', error)
      throw new Error('Failed to extract schedule from voice description')
    }
  }

  /**
   * Get contextual questions to gather more information about a task
   */
  async getContextualQuestions(taskName: string, taskDescription?: string): Promise<{
    questions: Array<{
      question: string
      type: 'text' | 'number' | 'choice'
      choices?: string[]
      purpose: string
    }>
  }> {
    const desc = taskDescription ? `\nDescription: ${taskDescription}` : ''

    const prompt = `
You are helping someone clarify a task by asking strategic questions.

Task: "${taskName}"${desc}

Generate 3-5 focused questions that would help you better understand:
- Scope and requirements
- Dependencies and constraints
- Success criteria
- Time sensitivity factors
- Resources needed

Return as JSON:
{
  "questions": [
    {
      "question": "What is the specific deliverable or outcome?",
      "type": "text",
      "purpose": "Clarify scope and success criteria"
    },
    {
      "question": "How many people are involved in this task?",
      "type": "choice",
      "choices": ["Just me", "2-3 people", "4-10 people", "Large team (10+)"],
      "purpose": "Understand coordination complexity"
    }
  ]
}

Make questions specific and actionable. Avoid generic questions.
`

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      return JSON.parse(content.text)
    } catch (error) {
      console.error('Error getting contextual questions:', error)
      throw new Error('Failed to generate contextual questions')
    }
  }
}

// Singleton instance with lazy initialization
let aiServiceInstance: AIService | null = null

export const getAIService = (): AIService => {
  if (!aiServiceInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }
    aiServiceInstance = new AIService(apiKey)
  }
  return aiServiceInstance
}
