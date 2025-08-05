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
        model: 'claude-3-5-sonnet-20241022',
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

      console.log('Raw Claude response:', content.text.substring(0, 200) + '...')
      
      // Try to extract JSON from the response (Claude sometimes adds extra text)
      let jsonText = content.text.trim()
      const jsonStart = jsonText.indexOf('{')
      const jsonEnd = jsonText.lastIndexOf('}')
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1)
      }
      
      const jsonResult = JSON.parse(jsonText)
      console.log('AI extraction successful:', jsonResult)
      return jsonResult
    } catch (error) {
      console.error('Error extracting tasks from brainstorm:', error)
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response as JSON: ${error.message}`)
      }
      throw new Error(`Failed to extract tasks from brainstorm text: ${error.message}`)
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
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 3000,
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
        model: 'claude-3-5-sonnet-20241022',
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
      console.error('Error enhancing task details:', error)
      throw new Error('Failed to enhance task details')
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
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
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