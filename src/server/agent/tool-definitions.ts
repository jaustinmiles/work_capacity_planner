/**
 * Agent Tool Definitions
 *
 * Defines the 20 curated tools available to the AI agent.
 * Each tool maps to a tRPC router procedure. Tool input schemas
 * mirror the Zod schemas in the corresponding router files.
 *
 * Tools are split into:
 * - Read tools (9): auto-execute, return data to Claude
 * - Write tools (11): pause for user approval before execution
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { ToolRegistration } from '../../shared/agent-types'

// ============================================================================
// Read Tool Definitions
// ============================================================================

const getTasksTool: Anthropic.Tool = {
  name: 'get_tasks',
  description:
    'Get all tasks for the current session. Returns task names, IDs, types, durations, priorities, statuses, deadlines, and sprint membership. Use this to understand what work exists before making recommendations or changes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      includeArchived: {
        type: 'boolean',
        description: 'Include archived tasks in results. Default: false.',
      },
    },
    required: [],
  },
}

const getTaskDetailTool: Anthropic.Tool = {
  name: 'get_task_detail',
  description:
    'Get full details for a single task including all workflow steps, dependencies, and notes. Use this when you need to understand a specific task in depth.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'The task ID to look up.',
      },
    },
    required: ['id'],
  },
}

const getScheduleForDateTool: Anthropic.Tool = {
  name: 'get_schedule_for_date',
  description:
    'Get the work schedule (time blocks and meetings) for a specific date. Returns block start/end times, types, and meetings. Use this to understand availability and what time slots exist.',
  input_schema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format.',
      },
    },
    required: ['date'],
  },
}

const getWorkSessionsTool: Anthropic.Tool = {
  name: 'get_work_sessions',
  description:
    'Get all logged work sessions for a specific date. Shows what the user actually worked on, with start/end times and durations. Use this for time analysis and gap-filling.',
  input_schema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format.',
      },
    },
    required: ['date'],
  },
}

const getActiveWorkSessionTool: Anthropic.Tool = {
  name: 'get_active_work_session',
  description:
    'Get the currently active (in-progress) work session, if any. Shows what task the user is currently working on.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
}

const getNextScheduledTool: Anthropic.Tool = {
  name: 'get_next_scheduled',
  description:
    'Get the next recommended work item from the scheduling engine. The scheduler considers priorities, dependencies, task types, and available schedule blocks to determine what the user should work on next.',
  input_schema: {
    type: 'object' as const,
    properties: {
      skipIndex: {
        type: 'number',
        description: 'Skip this many items from the top of the priority list. Use to get alternative recommendations. Default: 0.',
      },
    },
    required: [],
  },
}

const getEndeavorsTool: Anthropic.Tool = {
  name: 'get_endeavors',
  description:
    'Get all endeavors (higher-level goals that group related tasks/workflows). Returns endeavor names, statuses, and associated tasks. Use this to understand the big picture of what the user is working toward.',
  input_schema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'completed', 'paused', 'archived'],
        description: 'Filter by endeavor status. Omit for all non-archived endeavors.',
      },
      includeArchived: {
        type: 'boolean',
        description: 'Include archived endeavors. Default: false.',
      },
    },
    required: [],
  },
}

const getTaskTypesTool: Anthropic.Tool = {
  name: 'get_task_types',
  description:
    'Get all user-defined task types with their IDs, names, emojis, and colors. IMPORTANT: You need task type IDs when creating tasks, workflows, or schedule blocks. Always call this before creating tasks if you do not already know the type IDs.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
}

const getFullScheduleTool: Anthropic.Tool = {
  name: 'get_full_schedule',
  description:
    'Get the complete scheduled timeline for a date, as computed by the scheduling engine. Returns all scheduled items (tasks, workflow steps, meetings, breaks) with their assigned time slots, plus any unscheduled items that did not fit. Use this to understand the full picture of what the user\'s day looks like and identify gaps or overcommitments.',
  input_schema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format. Defaults to today if omitted.',
      },
    },
    required: [],
  },
}

const getTimeSummaryTool: Anthropic.Tool = {
  name: 'get_time_summary',
  description:
    'Get accumulated time logged by task type for a specific date. Returns a breakdown of minutes spent on each type and total minutes. Use this for daily time analysis and productivity insights.',
  input_schema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format.',
      },
    },
    required: ['date'],
  },
}

// ============================================================================
// Write Tool Definitions
// ============================================================================

const createTaskTool: Anthropic.Tool = {
  name: 'create_task',
  description:
    'Create a new standalone task. Requires a task type ID — call get_task_types first if you do not know available types. The task is created but NOT automatically added to the active sprint.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Task name. Be specific and actionable.',
      },
      duration: {
        type: 'number',
        description: 'Estimated duration in minutes.',
      },
      importance: {
        type: 'number',
        description: 'Importance on a 1-10 scale (10 = most important).',
        minimum: 1,
        maximum: 10,
      },
      urgency: {
        type: 'number',
        description: 'Urgency on a 1-10 scale (10 = most urgent).',
        minimum: 1,
        maximum: 10,
      },
      type: {
        type: 'string',
        description: 'Task type ID from get_task_types.',
      },
      notes: {
        type: 'string',
        description: 'Optional notes or description.',
      },
      deadline: {
        type: 'string',
        description: 'Optional deadline as ISO 8601 date string.',
      },
      deadlineType: {
        type: 'string',
        enum: ['hard', 'soft'],
        description: 'Whether the deadline is hard (immovable) or soft (preferred).',
      },
      cognitiveComplexity: {
        type: 'number',
        description: 'Cognitive complexity 1-5 (5 = most demanding). Affects scheduling into focus blocks.',
        minimum: 1,
        maximum: 5,
      },
    },
    required: ['name', 'duration', 'importance', 'urgency', 'type'],
  },
}

const updateTaskTool: Anthropic.Tool = {
  name: 'update_task',
  description:
    'Update fields on an existing task. Only include fields you want to change. Use get_tasks or get_task_detail first to get the task ID.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Task ID to update.',
      },
      name: { type: 'string', description: 'New task name.' },
      duration: { type: 'number', description: 'New duration in minutes.' },
      importance: { type: 'number', minimum: 1, maximum: 10, description: 'New importance (1-10).' },
      urgency: { type: 'number', minimum: 1, maximum: 10, description: 'New urgency (1-10).' },
      type: { type: 'string', description: 'New task type ID.' },
      notes: { type: 'string', description: 'New notes (replaces existing).' },
      deadline: { type: 'string', description: 'New deadline as ISO 8601 string, or null to remove.' },
      deadlineType: { type: 'string', enum: ['hard', 'soft'], description: 'Deadline type.' },
      cognitiveComplexity: { type: 'number', minimum: 1, maximum: 5, description: 'Cognitive complexity (1-5).' },
      overallStatus: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'waiting', 'completed'],
        description: 'Task status.',
      },
    },
    required: ['id'],
  },
}

const completeTaskTool: Anthropic.Tool = {
  name: 'complete_task',
  description:
    'Mark a task as completed. Optionally record the actual duration spent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Task ID to complete.',
      },
      actualDuration: {
        type: 'number',
        description: 'Actual minutes spent on the task (optional).',
      },
    },
    required: ['id'],
  },
}

const archiveTaskTool: Anthropic.Tool = {
  name: 'archive_task',
  description:
    'Archive a task, removing it from active views but keeping it in history.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Task ID to archive.',
      },
    },
    required: ['id'],
  },
}

const createWorkflowTool: Anthropic.Tool = {
  name: 'create_workflow',
  description:
    'Create a workflow (multi-step task) with sequenced steps. Each step has its own type and duration. Steps can have dependencies on other steps and async wait times.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Workflow name.',
      },
      importance: { type: 'number', minimum: 1, maximum: 10, description: 'Importance (1-10).' },
      urgency: { type: 'number', minimum: 1, maximum: 10, description: 'Urgency (1-10).' },
      type: {
        type: 'string',
        description: 'Default task type ID for the workflow container.',
      },
      notes: { type: 'string', description: 'Workflow notes.' },
      steps: {
        type: 'array',
        description: 'Ordered list of workflow steps.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Step name.' },
            duration: { type: 'number', description: 'Duration in minutes.' },
            type: { type: 'string', description: 'Task type ID for this step.' },
            dependsOn: {
              type: 'array',
              items: { type: 'string' },
              description: 'Names of steps this step depends on (must complete first).',
            },
            asyncWaitTime: {
              type: 'number',
              description: 'Minutes of async wait after this step (e.g., waiting for a response).',
            },
          },
          required: ['name', 'duration', 'type'],
        },
      },
    },
    required: ['name', 'importance', 'urgency', 'type', 'steps'],
  },
}

const addWorkflowStepTool: Anthropic.Tool = {
  name: 'add_workflow_step',
  description:
    'Add a new step to an existing workflow. The step is inserted at the end by default, or after/before a specific step.',
  input_schema: {
    type: 'object' as const,
    properties: {
      workflowId: {
        type: 'string',
        description: 'The workflow (task) ID to add the step to.',
      },
      name: { type: 'string', description: 'Step name.' },
      duration: { type: 'number', description: 'Duration in minutes.' },
      type: { type: 'string', description: 'Task type ID for this step.' },
      afterStep: { type: 'string', description: 'Insert after this step ID.' },
      beforeStep: { type: 'string', description: 'Insert before this step ID.' },
      dependencies: {
        type: 'array',
        items: { type: 'string' },
        description: 'Step IDs this step depends on.',
      },
      asyncWaitTime: { type: 'number', description: 'Async wait time in minutes after this step.' },
    },
    required: ['workflowId', 'name', 'duration', 'type'],
  },
}

const updateWorkflowStepTool: Anthropic.Tool = {
  name: 'update_workflow_step',
  description:
    'Update an existing workflow step. Can change name, duration, type, status, dependencies, and other fields. Use get_task_detail first to get step IDs.',
  input_schema: {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'The parent workflow (task) ID.',
      },
      stepId: {
        type: 'string',
        description: 'The step ID to update.',
      },
      name: { type: 'string', description: 'New step name.' },
      duration: { type: 'number', description: 'New duration in minutes.' },
      type: { type: 'string', description: 'New task type ID.' },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'waiting', 'completed', 'skipped'],
        description: 'New step status.',
      },
      dependsOn: {
        type: 'array',
        items: { type: 'string' },
        description: 'New dependency list — step IDs or step names that this step depends on.',
      },
      cognitiveComplexity: { type: 'number', minimum: 1, maximum: 5, description: 'Cognitive complexity (1-5).' },
      notes: { type: 'string', description: 'Step notes.' },
    },
    required: ['taskId', 'stepId'],
  },
}

const removeWorkflowStepTool: Anthropic.Tool = {
  name: 'remove_workflow_step',
  description:
    'Remove a step from an existing workflow. Remaining steps are automatically re-indexed. Use get_task_detail first to get step IDs.',
  input_schema: {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'The parent workflow (task) ID.',
      },
      stepId: {
        type: 'string',
        description: 'The step ID to remove.',
      },
    },
    required: ['taskId', 'stepId'],
  },
}

const logWorkSessionTool: Anthropic.Tool = {
  name: 'log_work_session',
  description:
    'Log time spent on a task. Creates a work session record with start time, end time, and duration. Use for backfilling time or recording completed work.',
  input_schema: {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID the time was spent on.',
      },
      stepId: {
        type: 'string',
        description: 'Optional workflow step ID within the task.',
      },
      startTime: {
        type: 'string',
        description: 'Start time as ISO 8601 datetime string.',
      },
      endTime: {
        type: 'string',
        description: 'End time as ISO 8601 datetime string.',
      },
      actualMinutes: {
        type: 'number',
        description: 'Actual minutes worked (calculated from start/end if omitted).',
      },
      notes: {
        type: 'string',
        description: 'Optional session notes.',
      },
    },
    required: ['taskId', 'startTime'],
  },
}

const createScheduleTool: Anthropic.Tool = {
  name: 'create_schedule',
  description:
    'Create or replace the work schedule for a specific date. Defines time blocks (with task type assignments) and meetings. Block times use "HH:MM" 24-hour format. Each block needs a typeConfig specifying which task types it accepts.',
  input_schema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format.',
      },
      blocks: {
        type: 'array',
        description: 'Work blocks for the day.',
        items: {
          type: 'object',
          properties: {
            startTime: { type: 'string', description: 'Block start in HH:MM format.' },
            endTime: { type: 'string', description: 'Block end in HH:MM format.' },
            typeConfig: {
              type: 'object',
              description: 'Block type configuration. Use kind "single" for one task type, "combo" for mixed blocks, "any" for a block that accepts any task type (scheduled by priority), or "system" for blocked/sleep time.',
              properties: {
                kind: {
                  type: 'string',
                  enum: ['single', 'combo', 'any', 'system'],
                  description: '"single" for one task type, "combo" for multiple types with ratios, "any" for any task type (priority-based), "system" for blocked/sleep time.',
                },
                typeId: {
                  type: 'string',
                  description: 'Task type ID (for kind "single").',
                },
                allocations: {
                  type: 'array',
                  description: 'Type allocations (for kind "combo").',
                  items: {
                    type: 'object',
                    properties: {
                      typeId: { type: 'string' },
                      percentage: { type: 'number', minimum: 0, maximum: 100 },
                    },
                    required: ['typeId', 'percentage'],
                  },
                },
                systemType: {
                  type: 'string',
                  enum: ['blocked', 'sleep'],
                  description: 'System block type (for kind "system").',
                },
              },
              required: ['kind'],
            },
          },
          required: ['startTime', 'endTime', 'typeConfig'],
        },
      },
      meetings: {
        type: 'array',
        description: 'Meetings/appointments for the day.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Meeting name.' },
            startTime: { type: 'string', description: 'Start in HH:MM format.' },
            endTime: { type: 'string', description: 'End in HH:MM format.' },
            type: {
              type: 'string',
              enum: ['meeting', 'break', 'personal', 'blocked'],
              description: 'Meeting type.',
            },
          },
          required: ['name', 'startTime', 'endTime', 'type'],
        },
      },
    },
    required: ['date'],
  },
}

const createEndeavorTool: Anthropic.Tool = {
  name: 'create_endeavor',
  description:
    'Create a new endeavor (a higher-level goal that groups related tasks and workflows).',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Endeavor name.' },
      description: { type: 'string', description: 'Description of the goal.' },
      importance: { type: 'number', minimum: 1, maximum: 10, description: 'Importance (1-10).' },
      urgency: { type: 'number', minimum: 1, maximum: 10, description: 'Urgency (1-10).' },
      deadline: { type: 'string', description: 'Optional deadline as ISO 8601 date string.' },
      deadlineType: { type: 'string', enum: ['hard', 'soft'], description: 'Deadline type.' },
      color: {
        type: 'string',
        description: 'Hex color like "#FF5733". Optional.',
      },
    },
    required: ['name'],
  },
}

const manageSprintTool: Anthropic.Tool = {
  name: 'manage_sprint',
  description:
    'Add or remove a task from the active sprint. Tasks in the sprint are scheduled by the scheduling engine and appear in the timeline.',
  input_schema: {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID to add/remove from sprint.',
      },
      inActiveSprint: {
        type: 'boolean',
        description: 'true to add to sprint, false to remove.',
      },
    },
    required: ['taskId', 'inActiveSprint'],
  },
}

const linkTaskToEndeavorTool: Anthropic.Tool = {
  name: 'link_task_to_endeavor',
  description:
    'Link a task or workflow to an endeavor (higher-level goal). Use get_endeavors to find the endeavor ID and get_tasks to find the task ID first.',
  input_schema: {
    type: 'object' as const,
    properties: {
      endeavorId: {
        type: 'string',
        description: 'The endeavor ID to link the task to.',
      },
      taskId: {
        type: 'string',
        description: 'The task ID to link.',
      },
    },
    required: ['endeavorId', 'taskId'],
  },
}

const createTaskTypeTool: Anthropic.Tool = {
  name: 'create_task_type',
  description:
    'Create a new user-defined task type with a name, emoji, and color. Task types categorize tasks and are used to match tasks to schedule blocks.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Type name (e.g., "Deep Work", "Admin").' },
      emoji: { type: 'string', description: 'Emoji icon (e.g., "🧠", "📋").' },
      color: {
        type: 'string',
        description: 'Hex color like "#4A90D9".',
      },
    },
    required: ['name', 'emoji', 'color'],
  },
}

// ============================================================================
// Memory Tool Definitions (auto-execute, no approval needed)
// ============================================================================

const getMemoriesTool: Anthropic.Tool = {
  name: 'get_memories',
  description:
    'Get all your stored memories for this session. Returns structured facts you have learned about the user — preferences, corrections, patterns, and facts. Use this to refresh your memory at the start of conversations or when you need to verify a remembered fact.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
}

const searchMemoryTool: Anthropic.Tool = {
  name: 'search_memory',
  description:
    'Search past conversation summaries by keyword and/or date range. Use this when the user references a past conversation ("remember when we talked about X?") or when you need historical context.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search keyword or phrase to find in past conversation summaries.',
      },
      startDate: {
        type: 'string',
        description: 'Optional start date (YYYY-MM-DD) to limit search range.',
      },
      endDate: {
        type: 'string',
        description: 'Optional end date (YYYY-MM-DD) to limit search range.',
      },
    },
    required: ['query'],
  },
}

const saveMemoryTool: Anthropic.Tool = {
  name: 'save_memory',
  description:
    'Save a new observation, preference, correction, or fact to your persistent memory. This survives across conversations. Use when you notice a pattern, the user corrects you, states a preference, or you learn an important fact. Keep memories concise (one sentence). Check existing memories first to avoid duplicates — use update_memory instead if one already covers the topic.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: ['preference', 'correction', 'pattern', 'fact'],
        description: 'Memory category: preference (work style), correction (things not to do), pattern (observed behavior), fact (deadlines, blockers).',
      },
      key: {
        type: 'string',
        description: 'Short unique label for this memory (e.g., "deep_work_preference", "estimate_accuracy_coding").',
      },
      value: {
        type: 'string',
        description: 'The fact itself in one concise sentence.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence 0-1. Use 1.0 for user-stated facts, 0.6-0.8 for observations.',
        minimum: 0,
        maximum: 1,
      },
    },
    required: ['category', 'key', 'value'],
  },
}

const updateMemoryTool: Anthropic.Tool = {
  name: 'update_memory',
  description:
    'Update an existing memory entry. Use when a preference changes, an observation needs refinement, or a fact is outdated. Get the memory ID from get_memories first.',
  input_schema: {
    type: 'object' as const,
    properties: {
      memoryId: {
        type: 'string',
        description: 'The memory ID to update (from get_memories).',
      },
      value: {
        type: 'string',
        description: 'New value for this memory.',
      },
      confidence: {
        type: 'number',
        description: 'Updated confidence score.',
        minimum: 0,
        maximum: 1,
      },
    },
    required: ['memoryId'],
  },
}

// ============================================================================
// Exports
// ============================================================================

/** Memory tools — auto-execute without approval (internal agent state only) */
export const MEMORY_TOOLS: Anthropic.Tool[] = [
  getMemoriesTool,
  searchMemoryTool,
  saveMemoryTool,
  updateMemoryTool,
]

/** Set of memory tool names — these auto-execute like read tools */
export const MEMORY_TOOL_NAMES = new Set(MEMORY_TOOLS.map(t => t.name))

/** All read tools — auto-execute without user approval */
export const READ_TOOLS: Anthropic.Tool[] = [
  getTasksTool,
  getTaskDetailTool,
  getScheduleForDateTool,
  getWorkSessionsTool,
  getActiveWorkSessionTool,
  getNextScheduledTool,
  getEndeavorsTool,
  getTaskTypesTool,
  getFullScheduleTool,
  getTimeSummaryTool,
]

/** All write tools — require user approval */
export const WRITE_TOOLS: Anthropic.Tool[] = [
  createTaskTool,
  updateTaskTool,
  completeTaskTool,
  archiveTaskTool,
  createWorkflowTool,
  addWorkflowStepTool,
  updateWorkflowStepTool,
  removeWorkflowStepTool,
  logWorkSessionTool,
  createScheduleTool,
  createEndeavorTool,
  linkTaskToEndeavorTool,
  manageSprintTool,
  createTaskTypeTool,
]

/** All tools combined for the API call */
export const ALL_TOOLS: Anthropic.Tool[] = [...READ_TOOLS, ...WRITE_TOOLS, ...MEMORY_TOOLS]

/** Set of read tool names for fast lookup */
export const READ_TOOL_NAMES = new Set(READ_TOOLS.map(t => t.name))

/** Set of write tool names for fast lookup */
export const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map(t => t.name))

/** Tool registration metadata for UI display */
export const TOOL_REGISTRY: Record<string, ToolRegistration> = {
  // Read tools
  get_tasks: { name: 'get_tasks', category: 'read', statusLabel: 'Checking your tasks...' },
  get_task_detail: { name: 'get_task_detail', category: 'read', statusLabel: 'Looking up task details...' },
  get_schedule_for_date: { name: 'get_schedule_for_date', category: 'read', statusLabel: 'Checking the schedule...' },
  get_work_sessions: { name: 'get_work_sessions', category: 'read', statusLabel: 'Reviewing work sessions...' },
  get_active_work_session: { name: 'get_active_work_session', category: 'read', statusLabel: 'Checking active session...' },
  get_next_scheduled: { name: 'get_next_scheduled', category: 'read', statusLabel: 'Consulting the scheduler...' },
  get_endeavors: { name: 'get_endeavors', category: 'read', statusLabel: 'Reviewing endeavors...' },
  get_task_types: { name: 'get_task_types', category: 'read', statusLabel: 'Loading task types...' },
  get_full_schedule: { name: 'get_full_schedule', category: 'read', statusLabel: 'Computing full schedule...' },
  get_time_summary: { name: 'get_time_summary', category: 'read', statusLabel: 'Calculating time summary...' },
  // Write tools
  create_task: { name: 'create_task', category: 'write', statusLabel: 'Creating task...' },
  update_task: { name: 'update_task', category: 'write', statusLabel: 'Updating task...' },
  complete_task: { name: 'complete_task', category: 'write', statusLabel: 'Completing task...' },
  archive_task: { name: 'archive_task', category: 'write', statusLabel: 'Archiving task...' },
  create_workflow: { name: 'create_workflow', category: 'write', statusLabel: 'Creating workflow...' },
  add_workflow_step: { name: 'add_workflow_step', category: 'write', statusLabel: 'Adding workflow step...' },
  update_workflow_step: { name: 'update_workflow_step', category: 'write', statusLabel: 'Updating workflow step...' },
  remove_workflow_step: { name: 'remove_workflow_step', category: 'write', statusLabel: 'Removing workflow step...' },
  log_work_session: { name: 'log_work_session', category: 'write', statusLabel: 'Logging work session...' },
  create_schedule: { name: 'create_schedule', category: 'write', statusLabel: 'Creating schedule...' },
  create_endeavor: { name: 'create_endeavor', category: 'write', statusLabel: 'Creating endeavor...' },
  link_task_to_endeavor: { name: 'link_task_to_endeavor', category: 'write', statusLabel: 'Linking task to endeavor...' },
  manage_sprint: { name: 'manage_sprint', category: 'write', statusLabel: 'Updating sprint...' },
  create_task_type: { name: 'create_task_type', category: 'write', statusLabel: 'Creating task type...' },
  // Memory tools (auto-execute)
  get_memories: { name: 'get_memories', category: 'read', statusLabel: 'Checking memory...' },
  search_memory: { name: 'search_memory', category: 'read', statusLabel: 'Searching past conversations...' },
  save_memory: { name: 'save_memory', category: 'read', statusLabel: 'Saving to memory...' },
  update_memory: { name: 'update_memory', category: 'read', statusLabel: 'Updating memory...' },
}
