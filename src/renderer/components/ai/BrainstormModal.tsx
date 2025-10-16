import { useState, useRef, useEffect, useCallback } from 'react'
import { Modal, Button, Typography, Alert, Space, Card, Input, Tag, Divider, Upload, Select, InputNumber } from '@arco-design/web-react'
import { IconSoundFill, IconPause, IconStop, IconRefresh, IconRobot, IconBulb, IconCheckCircle, IconUpload, IconFile, IconEdit } from '@arco-design/web-react/icon'
import { TaskType, AIProcessingMode } from '@shared/enums'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import { logger } from '@/logger'
import { deleteWorkflow, deleteTask, deleteStep } from '../../utils/brainstorm-utils'


const { TextArea } = Input
const { Text } = Typography

interface BrainstormModalProps {
  visible: boolean
  onClose: () => void
  onTasksExtracted: (__tasks: ExtractedTask[]) => void
  onWorkflowsExtracted?: (workflows: ExtractedWorkflow[], __standaloneTasks: ExtractedTask[]) => void
}

interface ExtractedTask {
  name: string
  description: string
  estimatedDuration: number
  importance: number
  urgency: number
  type: TaskType
  needsMoreInfo?: boolean
  clarificationRequest?: string
  userClarification?: string
}

interface ExtractedWorkflow {
  name: string
  description: string
  importance: number
  urgency: number
  type: TaskType
  steps: any[]
  duration?: number
  totalDuration: number
  earliestCompletion: string
  worstCaseCompletion: string
  notes: string
  clarificationRequest?: string
  userClarification?: string
}

interface BrainstormResult {
  summary: string
  tasks?: ExtractedTask[]
  workflows?: ExtractedWorkflow[]
  standaloneTasks?: ExtractedTask[]
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

// Helper function to convert string literals to TaskType enum
function toTaskType(type: string): TaskType {
  // Only accept our 3 valid task types
  if (type === 'focused' || type === TaskType.Focused) return TaskType.Focused
  if (type === 'admin' || type === TaskType.Admin) return TaskType.Admin
  if (type === 'personal' || type === TaskType.Personal) return TaskType.Personal

  // Log warning for invalid types and default to personal
  // (things like "routine", "relaxation" are more personal than work)
  logger.ui.warn(`Invalid task type "${type}" received from AI, defaulting to "personal"`)
  return TaskType.Personal
}

export function BrainstormModal({ visible, onClose, onTasksExtracted, onWorkflowsExtracted }: BrainstormModalProps) {
  const [brainstormText, setBrainstormText] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [brainstormResult, setBrainstormResult] = useState<BrainstormResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [processingMode, setProcessingMode] = useState<AIProcessingMode>(AIProcessingMode.Workflows)
  const [jobContext, setJobContext] = useState('')
  const [showJobContextInput, setShowJobContextInput] = useState(true) // Default to visible for better discoverability
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null)
  const [isProcessingAudioFile, setIsProcessingAudioFile] = useState(false)
  const [contextAudioFile, setContextAudioFile] = useState<File | null>(null)
  const [isProcessingContextAudio, setIsProcessingContextAudio] = useState(false)
  const [jargonDictionary, setJargonDictionary] = useState<Record<string, string>>({})
  const [showJargonInput, setShowJargonInput] = useState(false)
  const [newJargonTerm, setNewJargonTerm] = useState('')
  const [newJargonDefinition, setNewJargonDefinition] = useState('')
  const [contextRecordingState, setContextRecordingState] = useState<RecordingState>('idle')
  const [contextRecordingDuration, setContextRecordingDuration] = useState(0)
  const [showClarificationMode, setShowClarificationMode] = useState(false)
  const [editableResult, setEditableResult] = useState<BrainstormResult | null>(null)
  const [clarifications, setClarifications] = useState<Record<string, string>>({})
  const [regeneratingItems, setRegeneratingItems] = useState<Set<string>>(new Set())
  const [appliedClarifications, setAppliedClarifications] = useState<Set<string>>(new Set())
  // TODO: Add voice recording support in clarification mode
  // const [clarificationVoiceRecording, setClarificationVoiceRecording] = useState<RecordingState>('idle')
  // const [clarificationVoiceDuration, setClarificationVoiceDuration] = useState(0)
  // const clarificationMediaRecorderRef = useRef<MediaRecorder | null>(null)
  // const clarificationAudioChunksRef = useRef<Blob[]>([])
  // const clarificationRecordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const contextMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const contextAudioChunksRef = useRef<Blob[]>([])
  const contextRecordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Define stopRecording before using it in useEffect
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState !== 'idle') {
      mediaRecorderRef.current.stop()
      setRecordingState('stopped')
    }
  }, [recordingState])

  // Context recording functions
  const startContextRecording = async () => {
    if (contextRecordingState === 'recording' || contextMediaRecorderRef.current?.state === 'recording') {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm'

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      })

      contextMediaRecorderRef.current = mediaRecorder
      contextAudioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          contextAudioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(contextAudioChunksRef.current, { type: mimeType })

        // Process as context audio
        setIsProcessingContextAudio(true)
        try {
          const extension = mimeType.split('/')[1]?.split(';')[0] || 'webm'
        const audioFile = new File([audioBlob], `context-recording.${extension}`, { type: mimeType })
          await processContextAudio(audioFile)
        } finally {
          setIsProcessingContextAudio(false)
        }

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.onerror = (_event) => {
        logger.ui.error('Context MediaRecorder error', {}, 'context-mediarecorder-error')
        setError('Context recording error occurred')
        setContextRecordingState('idle')
      }

      mediaRecorder.start(100)
      setContextRecordingDuration(0)
      setError(null)
      setContextRecordingState('recording')
    } catch (error) {
      logger.ui.error('Error starting context recording', {
        error: error instanceof Error ? error.message : String(error),
      }, 'context-recording-start-error')
      setError('Failed to access microphone. Please check your permissions.')
      setContextRecordingState('idle')
    }
  }

  const stopContextRecording = useCallback(() => {
    if (contextMediaRecorderRef.current && contextRecordingState !== 'idle') {
      contextMediaRecorderRef.current.stop()
      setContextRecordingState('stopped')
    }
  }, [contextRecordingState])

  // Load active job context and jargon dictionary when modal opens
  useEffect(() => {
    const loadJobContext = async () => {
      try {
        const activeContext = await getDatabase().getActiveJobContext()
        if (activeContext) {
          setJobContext(activeContext.context)
        }
      } catch (error) {
        logger.ui.error('Error loading job context', {
          error: error instanceof Error ? error.message : String(error),
        }, 'job-context-load-error')
      }
    }

    const loadJargonDictionary = async () => {
      try {
        const dictionary = await getDatabase().getJargonDictionary()
        setJargonDictionary(dictionary)
      } catch (error) {
        logger.ui.error('Error loading jargon dictionary', {
          error: error instanceof Error ? error.message : String(error),
        }, 'jargon-dictionary-load-error')
      }
    }

    // Only run initialization when modal becomes visible
    if (visible) {
      // Use a ref to track if we've already initialized
      setBrainstormText('')
      setBrainstormResult(null)
      setError(null)
      setRecordingState('idle')
      setRecordingDuration(0)
      setContextRecordingState('idle')
      setContextRecordingDuration(0)
      loadJobContext()
      loadJargonDictionary()
    }
  }, [visible]) // Remove stopRecording from dependencies

  // Separate effect for cleanup when modal closes
  useEffect(() => {
    if (!visible && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopRecording()
    }
  }, [visible, stopRecording])

  // Recording timer
  useEffect(() => {
    if (recordingState === 'recording') {
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [recordingState])

  // Context recording timer
  useEffect(() => {
    if (contextRecordingState === 'recording') {
      contextRecordingTimerRef.current = setInterval(() => {
        setContextRecordingDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (contextRecordingTimerRef.current) {
        clearInterval(contextRecordingTimerRef.current)
        contextRecordingTimerRef.current = null
      }
    }

    return () => {
      if (contextRecordingTimerRef.current) {
        clearInterval(contextRecordingTimerRef.current)
      }
    }
  }, [contextRecordingState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up recording if component unmounts
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop()
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
        } catch (error) {
          logger.ui.error('Error cleaning up recording', {
            error: error instanceof Error ? error.message : String(error),
          }, 'recording-cleanup-error')
        }
      }
    }
  }, [])

  const startRecording = async () => {
    // Prevent multiple recordings
    if (recordingState === 'recording' || mediaRecorderRef.current?.state === 'recording') {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Try to find a supported MIME type
      let mimeType = 'audio/webm'
      const possibleTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ]

      for (const type of possibleTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type
          break
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        const extension = mimeType.split('/')[1]?.split(';')[0] || 'webm'
        await transcribeAudio(audioBlob, `recording.${extension}`)

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.onerror = (_event) => {
        logger.ui.error('MediaRecorder error', {}, 'mediarecorder-error')
        setError('Recording error occurred')
        setRecordingState('idle')
      }

      mediaRecorder.start(1000) // Collect data every second

      // Force state update to ensure UI updates
      setRecordingDuration(0)
      setError(null)
      setRecordingState('recording')
    } catch (error) {
      logger.ui.error('Error starting recording', {
        error: error instanceof Error ? error.message : String(error),
      }, 'recording-start-error')
      setError('Failed to access microphone. Please check your permissions.')
      setRecordingState('idle')
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.pause()
      setRecordingState('paused')
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'paused') {
      mediaRecorderRef.current.resume()
      setRecordingState('recording')
    }
  }

  const transcribeAudio = async (audioBlob: Blob, filename: string = 'brainstorm.webm') => {
    setIsTranscribing(true)
    try {
      // Log audio blob details for debugging
        // filename,
        // size: audioBlob.size,
        // type: audioBlob.type,
        // sizeInMB: (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB',
      // })

      const arrayBuffer = await audioBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const settings = await getDatabase().getBrainstormingSettings()
      const result = await getDatabase().transcribeAudioBuffer(
        uint8Array as any, // Cast to Buffer-like for IPC
        filename,
        settings,
      )

      setBrainstormText(prev => prev + (prev ? ' ' : '') + result.text)
      setError(null)
    } catch (error) {
      logger.ui.error('Error transcribing audio', {
        error: error instanceof Error ? error.message : String(error),
      }, 'transcription-error')
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`Failed to transcribe audio: ${errorMessage}`)
    } finally {
      setIsTranscribing(false)
    }
  }

  const processUploadedAudio = async (file: File) => {
    setIsProcessingAudioFile(true)
    setError(null)
    try {
      // Validate file type
      const supportedFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']
      const extension = file.name.split('.').pop()?.toLowerCase()

      if (!extension || !supportedFormats.includes(extension)) {
        throw new Error(`Unsupported audio format: ${extension}. Supported formats: ${supportedFormats.join(', ')}`)
      }

      // Clear existing text when processing a new file
      setBrainstormText('')

      // Ensure correct MIME type for WebM files
      let mimeType = file.type
      if (extension === 'webm' && (!mimeType || mimeType === 'application/octet-stream')) {
        mimeType = 'audio/webm'
      }

      const blob = new Blob([file], { type: mimeType })
      await transcribeAudio(blob, file.name)

      setUploadedAudioFile(file)
      Message.success(`Successfully processed ${file.name}`)
    } catch (error) {
      logger.ui.error('Error processing uploaded audio', {
        error: error instanceof Error ? error.message : String(error),
      }, 'uploaded-audio-error')
      const errorMessage = error instanceof Error ? error.message : 'Failed to process uploaded audio file.'
      setError(errorMessage)
      Message.error(errorMessage)
    } finally {
      setIsProcessingAudioFile(false)
    }
  }

  const processContextAudio = async (file: File) => {
    setIsProcessingContextAudio(true)
    setError(null)
    try {
      // Validate file type
      const supportedFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']
      const extension = file.name.split('.').pop()?.toLowerCase()

      if (!extension || !supportedFormats.includes(extension)) {
        throw new Error(`Unsupported audio format: ${extension}. Supported formats: ${supportedFormats.join(', ')}`)
      }

      // Ensure correct MIME type for WebM files
      let mimeType = file.type
      if (extension === 'webm' && (!mimeType || mimeType === 'application/octet-stream')) {
        mimeType = 'audio/webm'
      }

      const blob = new Blob([file], { type: mimeType })
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const settings = await getDatabase().getBrainstormingSettings()
      const result = await getDatabase().transcribeAudioBuffer(
        uint8Array as any,
        file.name,
        settings,
      )

      // Append to job context
      const fullContext = jobContext + (jobContext ? '\n\n' : '') + result.text
      setJobContext(fullContext)
      setContextAudioFile(file)

      // Auto-save the context
      await saveJobContext(fullContext)

      // Extract potential jargon terms using AI
      await extractJargonTerms(fullContext)

      Message.success(`Successfully processed context from ${file.name}`)
    } catch (error) {
      logger.ui.error('Error processing context audio', {
        error: error instanceof Error ? error.message : String(error),
      }, 'context-audio-error')
      const errorMessage = error instanceof Error ? error.message : 'Failed to process context audio file.'
      setError(errorMessage)
      Message.error(errorMessage)
    } finally {
      setIsProcessingContextAudio(false)
    }
  }

  const extractJargonTerms = async (contextText: string) => {
    if (!contextText.trim()) return

    try {
      // Use AI to extract potential jargon terms
      const __prompt = `Based on this job context, identify technical terms, acronyms, and industry-specific jargon that might need definition. Return ONLY a JSON array of terms (no definitions needed, just the terms themselves).

Context:
${contextText}

Return format: ["term1", "term2", "term3", ...]
Only include terms that are likely industry-specific or technical jargon, not common words.`

      const response = await window.electronAPI.ai.extractJargonTerms(contextText)

      try {
        const terms = JSON.parse(response)
        if (Array.isArray(terms)) {
          // Filter out terms that already have definitions
          const existingTerms = Object.keys(jargonDictionary)
          const newTerms = terms.filter(term =>
            !existingTerms.some(existing =>
              existing.toLowerCase() === term.toLowerCase(),
            ),
          )

          // Show suggested terms to user (they can define them)
          if (newTerms.length > 0) {
            Message.info(`Found ${newTerms.length} potential jargon terms: ${newTerms.slice(0, 5).join(', ')}${newTerms.length > 5 ? '...' : ''}`)

            // Add empty entries for new terms so user can fill them in
            const updatedDictionary = { ...jargonDictionary }
            for (const term of newTerms.slice(0, 10)) { // Limit to 10 at a time
              updatedDictionary[term] = ''
            }
            setJargonDictionary(updatedDictionary)
          }
        }
      } catch (parseError) {
        logger.ui.error('Failed to parse jargon terms', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
        }, 'jargon-parse-error')
      }
    } catch (error) {
      logger.ui.error('Error extracting jargon terms', {
        error: error instanceof Error ? error.message : String(error),
      }, 'jargon-extract-error')
      // Non-critical error, don't show to user
    }
  }

  const saveJobContext = async (contextText?: string) => {
    const textToSave = contextText || jobContext
    if (!textToSave.trim()) return

    try {
      const activeContext = await getDatabase().getActiveJobContext()

      if (activeContext) {
        // Update existing context
        await getDatabase().updateJobContext(activeContext.id, {
          context: textToSave,
          updatedAt: new Date(),
        })
      } else {
        // Create new context
        await getDatabase().createJobContext({
          name: 'Primary Work Context',
          description: 'Main job context for AI-powered workflow generation',
          context: textToSave,
          isActive: true,
        })
      }
    } catch (error) {
      logger.ui.error('Error saving job context', {
        error: error instanceof Error ? error.message : String(error),
      }, 'job-context-save-error')
    }
  }

  const addJargonEntry = async () => {
    if (!newJargonTerm.trim() || !newJargonDefinition.trim()) return

    try {
      await getDatabase().createJargonEntry({
        term: newJargonTerm.trim(),
        definition: newJargonDefinition.trim(),
        category: 'custom',
      })

      // Reload jargon dictionary
      const dictionary = await getDatabase().getJargonDictionary()
      setJargonDictionary(dictionary)

      // Clear inputs
      setNewJargonTerm('')
      setNewJargonDefinition('')
      setShowJargonInput(false)
    } catch (error) {
      logger.ui.error('Error adding jargon entry', {
        error: error instanceof Error ? error.message : String(error),
      }, 'jargon-entry-add-error')
      setError('Failed to add jargon entry. Term might already exist.')
    }
  }

  const processWithAI = async () => {
    if (!brainstormText.trim()) {
      setError('Please provide some brainstorm text to process.')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      // Create enriched context with jargon dictionary
      const jargonInfo = Object.keys(jargonDictionary).length > 0
        ? `\n\nIndustry Jargon Dictionary:\n${Object.entries(jargonDictionary)
            .map(([term, def]) => `- ${term}: ${def}`)
            .join('\n')}`
        : ''

      const enrichedContext = (jobContext.trim() || '') + jargonInfo

      if (processingMode === AIProcessingMode.Workflows) {
        const result = await getDatabase().extractWorkflowsFromBrainstorm(
          brainstormText.trim(),
          enrichedContext ?? null,
        )
        setBrainstormResult({
          workflows: result.workflows.map(wf => ({
            ...wf,
            type: toTaskType(wf.type),
            duration: wf.totalDuration || 0,
            totalDuration: wf.totalDuration || 0,
            // Also validate step types
            steps: wf.steps.map((step: any) => ({
              ...step,
              type: toTaskType(step.type),
            })),
          })),
          standaloneTasks: result.standaloneTasks.map(task => ({
            ...task,
            type: toTaskType(task.type),
          })),
          summary: result.summary,
        })
      } else {
        const result = await getDatabase().extractTasksFromBrainstorm(brainstormText.trim())
        setBrainstormResult({
          summary: result.summary,
          tasks: result.tasks.map(task => ({
            ...task,
            type: toTaskType(task.type),
          })),
        })
      }
    } catch (error) {
      logger.ui.error('Error processing brainstorm', {
        error: error instanceof Error ? error.message : String(error),
      }, 'brainstorm-process-error')
      setError('Failed to process brainstorm with AI. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUseResults = () => {
    const resultsToUse = editableResult || brainstormResult
    if (resultsToUse) {
      if (resultsToUse.workflows && resultsToUse.workflows.length > 0) {
        // Handle workflow-first results
        if (onWorkflowsExtracted) {
          onWorkflowsExtracted(
            resultsToUse.workflows,
            resultsToUse.standaloneTasks || [],
          )
        }
      } else if (resultsToUse.tasks && resultsToUse.tasks.length > 0) {
        // Handle task-only results
        onTasksExtracted(resultsToUse.tasks)
      }
      onClose()
    }
  }

  const handleProvideClarifications = () => {
    setShowClarificationMode(true)
    setEditableResult(JSON.parse(JSON.stringify(brainstormResult))) // Deep copy
  }

  const handleRegenerateAllWithClarifications = async () => {
    if (!editableResult || Object.keys(clarifications).length === 0) {
      Message.warning('Please provide at least one clarification before regenerating')
      return
    }


    // Collect all items that have clarifications
    const itemsToRegenerate: Array<{type: 'workflow' | 'task', index: number}> = []

    Object.keys(clarifications).forEach(key => {
      if (clarifications[key]?.trim()) {
        const [type, index] = key.split('-')
        itemsToRegenerate.push({
          type: type as 'workflow' | 'task',
          index: parseInt(index),
        })
      }
    })

    if (itemsToRegenerate.length === 0) {
      Message.warning('No clarifications provided. Please add clarifications before regenerating.')
      return
    }

    // Regenerate all items with clarifications
    for (const item of itemsToRegenerate) {
      await handleRegenerateSingle(item.type, item.index)
    }

    Message.success(`Successfully regenerated ${itemsToRegenerate.length} items with clarifications`)
  }

  const handleRegenerateSingle = async (itemType: 'workflow' | 'task', index: number) => {
    if (!editableResult) return

    const itemKey = `${itemType}-${index}`
    setRegeneratingItems(prev => new Set(prev).add(itemKey))

    try {
      const item = itemType === 'workflow' ? editableResult.workflows![index] : editableResult.tasks![index]
      const clarification = clarifications[`${itemType}-${index}`] || ''

      if (!clarification.trim()) {
        Message.warning('Please provide a clarification before regenerating')
        setRegeneratingItems(prev => {
          const next = new Set(prev)
          next.delete(itemKey)
          return next
        })
        return
      }

        // itemName: item.name,
        // clarification,
      // })

      // Build prompt with clarification
      const prompt = `Regenerate this ${itemType} with the following clarification:\n\nOriginal: ${JSON.stringify(item)}\n\nClarification: ${clarification}\n\nProvide an improved version addressing the clarification.`

      // Call AI to regenerate just this item
      const db = getDatabase()
      const response = await db.extractWorkflowsFromBrainstorm(prompt)

      if (response) {
          // hasWorkflows: !!response.workflows,
          // workflowCount: response.workflows?.length,
          // hasStandaloneTasks: !!response.standaloneTasks,
          // taskCount: response.standaloneTasks?.length,
        // })

        if (itemType === 'workflow' && response && response.workflows && response.workflows[0]) {
          const updatedWorkflow = {
            ...response.workflows[0],
            type: toTaskType(response.workflows[0].type as any),
          }

            // oldName: editableResult.workflows![index].name,
            // newName: updatedWorkflow.name,
            // index,
          // })

          // Create a new object to ensure React detects the change
          const newEditableResult = {
            ...editableResult,
            workflows: [...(editableResult.workflows || [])],
          }
          newEditableResult.workflows![index] = updatedWorkflow
          setEditableResult(newEditableResult)

          // Clear the clarification field and mark as applied
          setClarifications(prev => {
            const next = { ...prev }
            delete next[itemKey]
            return next
          })
          setAppliedClarifications(prev => new Set(prev).add(itemKey))

          Message.success(`Workflow "${updatedWorkflow.name}" regenerated successfully with clarifications applied`)
        } else if (itemType === 'task' && response && response.standaloneTasks && response.standaloneTasks[0]) {
          const updatedTask = {
            ...response.standaloneTasks[0],
            type: toTaskType(response.standaloneTasks[0].type as any),
          }

            // oldName: editableResult.tasks![index].name,
            // newName: updatedTask.name,
            // index,
          // })

          // Create a new object to ensure React detects the change
          const newEditableResult = {
            ...editableResult,
            tasks: [...(editableResult.tasks || [])],
          }
          newEditableResult.tasks![index] = updatedTask
          setEditableResult(newEditableResult)

          // Clear the clarification field and mark as applied
          setClarifications(prev => {
            const next = { ...prev }
            delete next[itemKey]
            return next
          })
          setAppliedClarifications(prev => new Set(prev).add(itemKey))

          Message.success(`Task "${updatedTask.name}" regenerated successfully with clarifications applied`)
        } else {
          Message.warning(`Could not regenerate ${itemType}. Please try again with more specific clarifications.`)
        }
      } else {
        Message.warning('No response from AI. Please try again.')
      }
    } catch (error) {
      logger.ui.error('Error regenerating item', {
        error: error instanceof Error ? error.message : String(error),
        itemType,
        index,
      }, 'item-regenerate-error')
      setError(`Failed to regenerate ${itemType}. Please try again.`)
    } finally {
      setRegeneratingItems(prev => {
        const next = new Set(prev)
        next.delete(itemKey)
        return next
      })
    }
  }

  const handleEditField = (itemType: 'workflow' | 'task', index: number, field: string, value: any) => {
    if (!editableResult) return

    const newResult = { ...editableResult }
    if (itemType === 'workflow' && newResult.workflows) {
      (newResult.workflows[index] as any)[field] = value
    } else if (itemType === 'task' && newResult.tasks) {
      (newResult.tasks[index] as any)[field] = value
    }
    setEditableResult(newResult)
  }

  const handleDeleteWorkflow = (index: number) => {
    const newResult = deleteWorkflow(editableResult, index)
    if (newResult) {
      setEditableResult(newResult)
    }
  }

  const handleDeleteTask = (index: number) => {
    const newResult = deleteTask(editableResult, index)
    if (newResult) {
      setEditableResult(newResult)
    }
  }

  const handleDeleteStep = (workflowIndex: number, stepIndex: number) => {
    const newResult = deleteStep(editableResult, workflowIndex, stepIndex)
    if (newResult) {
      setEditableResult(newResult)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getRecordingButtonProps = () => {
    switch (recordingState) {
      case 'idle':
        return {
          icon: <IconSoundFill />,
          children: 'Start Recording',
          onClick: startRecording,
          type: 'primary' as const,
        }
      case 'recording':
        return {
          icon: <IconPause />,
          children: `Recording... ${formatDuration(recordingDuration)}`,
          onClick: pauseRecording,
          status: 'danger' as const,
        }
      case 'paused':
        return {
          icon: <IconSoundFill />,
          children: `Resume (${formatDuration(recordingDuration)})`,
          onClick: resumeRecording,
          type: 'primary' as const,
        }
      case 'stopped':
        return {
          icon: <IconRefresh />,
          children: 'Record Again',
          onClick: startRecording,
          type: 'outline' as const,
        }
    }
  }

  return (
    <Modal
      title={
        <Space>
          <IconBulb />
          <span>AI-Powered Task Brainstorming</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: 900 }} // Wider for better content display
      autoFocus={false}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Processing Mode Selection */}
        <Card
          size="small"
          title={<><IconRobot /> Processing Mode</> }
          style={{ marginBottom: 16 }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 14 }}>
              Choose how the AI interprets your input:
            </Text>
            <Space>
              <Button
                type={processingMode === AIProcessingMode.Workflows ? 'primary' : 'outline'}
                onClick={() => setProcessingMode(AIProcessingMode.Workflows)}
                icon={<IconBulb />}
              >
                Workflows (Recommended)
              </Button>
              <Button
                type={processingMode === AIProcessingMode.Tasks ? 'primary' : 'outline'}
                onClick={() => setProcessingMode(AIProcessingMode.Tasks)}
              >
                Simple Tasks
              </Button>
            </Space>
            {processingMode === AIProcessingMode.Workflows && (
              <Alert
                type="info"
                content="Workflows mode understands dependencies, wait times, and sequences."
                style={{ marginTop: 8 }}
              />
            )}
          </Space>
        </Card>

        {/* Job Context Section */}
        {processingMode === AIProcessingMode.Workflows && (
          <Card
            size="small"
            title={
              <Space>
                <IconBulb />
                <span>Job Context & Terminology</span>
              </Space>
            }
            extra={
              <Space>
                <Button
                  size="small"
                  type="text"
                  status="danger"
                  onClick={() => {
                    setJobContext('')
                    setJargonDictionary({})
                    saveJobContext('')
                    Message.success('Context cleared')
                  }}
                >
                  Clear All
                </Button>
                <Button
                  size="small"
                  type="text"
                  onClick={() => setShowJobContextInput(!showJobContextInput)}
                >
                  {showJobContextInput ? 'Collapse' : 'Expand'}
                </Button>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            {showJobContextInput && (
              <Space direction="vertical" style={{ width: '100%' }} size="medium">
                <Alert
                  type="info"
                  content="Provide context about your role to help AI better understand your workflow patterns."
                />
                <div>
                  <Text style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, display: 'block' }}>
                    Your Role & Work Patterns:
                  </Text>
                  <TextArea
                    value={jobContext}
                    onChange={setJobContext}
                    placeholder="Example: I'm a software engineer working with CI/CD pipelines. Code reviews typically take 4-24 hours, deployments require approval and take 2-3 hours..."
                    rows={4}
                    style={{ marginBottom: 8 }}
                    onBlur={() => saveJobContext()}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    💡 Tip: Context is automatically saved for future sessions
                  </Text>
                </div>

                <Divider style={{ margin: '12px 0' }} />

                {/* Voice Context Options */}
                <div style={{
                  padding: 12,
                  backgroundColor: '#f5f5f5',
                  borderRadius: 8,
                  border: '1px solid #e8e8e8',
                }}>
                  <Text style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, display: 'block' }}>
                    Voice Input Options:
                  </Text>
                  <Space style={{ marginTop: 8 }}>
                    <Upload
                      accept="audio/*"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        processContextAudio(file)
                        return false
                      }}
                      disabled={isProcessingContextAudio}
                    >
                      <Button
                        icon={<IconUpload />}
                      loading={isProcessingContextAudio}
                      size="small"
                    >
                      {isProcessingContextAudio ? 'Processing...' : 'Upload Voice Context'}
                    </Button>
                  </Upload>
                    <Button
                      icon={contextRecordingState === 'recording' ? <IconStop /> : <IconSoundFill />}
                      loading={isProcessingContextAudio && contextRecordingState === 'stopped'}
                      onClick={contextRecordingState === 'recording' ? stopContextRecording : startContextRecording}
                      size="small"
                      status={contextRecordingState === 'recording' ? 'danger' : 'default'}
                    >
                      {contextRecordingState === 'recording'
                        ? `Recording... ${formatDuration(contextRecordingDuration)}`
                        : 'Record Context'}
                    </Button>
                  </Space>
                  {contextAudioFile && (
                    <Tag icon={<IconFile />} style={{ marginTop: 8 }}>
                      {contextAudioFile.name}
                    </Tag>
                  )}
                </div>
              </Space>
            )}

            {/* Jargon Dictionary - Always visible when in workflow mode */}
            {showJobContextInput && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <div>
                  <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <Text style={{ fontSize: 14, fontWeight: 500 }}>Industry Terminology</Text>
                      <Tag color="blue" size="small">{Object.keys(jargonDictionary).length} terms</Tag>
                    </Space>
                    <Button
                      size="small"
                      type="text"
                      onClick={() => setShowJargonInput(!showJargonInput)}
                    >
                      Add Term
                    </Button>
                    <Button
                      size="small"
                      type="outline"
                      onClick={async () => {
                        // Extract jargon from job context
                        if (jobContext.trim()) {
                          try {
                            const response = await getDatabase().extractJargonTerms(jobContext)
                            const terms = JSON.parse(response)
                            if (Array.isArray(terms)) {
                              const existingTerms = Object.keys(jargonDictionary)
                              const newTerms = terms.filter(term =>
                                !existingTerms.some(existing =>
                                  existing.toLowerCase() === term.toLowerCase(),
                                ),
                              )
                              if (newTerms.length > 0) {
                                Message.info(`Found ${newTerms.length} potential jargon terms`)
                                const updatedDictionary = { ...jargonDictionary }
                                for (const term of newTerms.slice(0, 10)) {
                                  updatedDictionary[term] = ''
                                }
                                setJargonDictionary(updatedDictionary)
                              } else {
                                Message.info('No new jargon terms found')
                              }
                            }
                          } catch (error) {
                            logger.ui.error('Failed to extract jargon', {
                              error: error instanceof Error ? error.message : String(error),
                            }, 'jargon-auto-extract-error')
                            Message.error('Failed to extract jargon terms')
                          }
                        } else {
                          Message.warning('Please add job context first')
                        }
                      }}
                    >
                      Auto-Extract Terms
                    </Button>
                  </Space>

                  {showJargonInput && (
                    <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
                      <Input
                        placeholder="Term (e.g., CI/CD, PR, K8s)"
                        value={newJargonTerm}
                        onChange={setNewJargonTerm}
                        size="small"
                      />
                      <Input
                        placeholder="Definition"
                        value={newJargonDefinition}
                        onChange={setNewJargonDefinition}
                        size="small"
                      />
                      <Space>
                        <Button size="small" type="primary" onClick={addJargonEntry}>
                          Add
                        </Button>
                        <Button size="small" onClick={() => setShowJargonInput(false)}>
                          Cancel
                        </Button>
                      </Space>
                    </Space>
                  )}

                  {Object.keys(jargonDictionary).length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {Object.entries(jargonDictionary).map(([term, definition]) => (
                          <div key={term} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                            <Tag style={{ minWidth: 100 }}>{term}</Tag>
                            <Input
                              size="small"
                              placeholder="Enter definition..."
                              value={definition}
                              onChange={(value) => {
                                // Update local state immediately
                                const updated = { ...jargonDictionary, [term]: value }
                                setJargonDictionary(updated)
                              }}
                              onBlur={async () => {
                                // Save to database when user leaves the field
                                try {
                                  await getDatabase().updateJargonDefinition(term, definition)
                                } catch (error) {
                                  logger.ui.error('Error updating jargon definition', {
                                    error: error instanceof Error ? error.message : String(error),
                                    term,
                                  }, 'jargon-definition-update-error')
                                }
                              }}
                              style={{ flex: 1 }}
                            />
                          </div>
                        ))}
                      </Space>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        )}

        {/* Voice Recording Section */}
        <Card
          size="small"
          title={<><IconSoundFill /> Voice Input</> }
          style={{ marginBottom: 16 }}
        >
          <Text type="secondary" style={{ fontSize: 14 }}>
            {processingMode === AIProcessingMode.Workflows
              ? 'Describe your async workflows naturally - mention dependencies, wait times, and sequencing.'
              : 'Record your thoughts about upcoming tasks, projects, or ideas.'
            }
          </Text>

          <div style={{ marginTop: 16 }}>
            <Space>
              <Button
                {...getRecordingButtonProps()}
                loading={isTranscribing}
                disabled={isProcessing}
              />

              {recordingState !== 'idle' && (
                <Button
                  icon={<IconStop />}
                  onClick={stopRecording}
                  disabled={isTranscribing}
                >
                  Stop
                </Button>
              )}

              {isTranscribing && <Text type="secondary">Transcribing...</Text>}
            </Space>
          </div>
        </Card>

        {/* Audio File Upload Section */}
        <Card
          size="small"
          title={<><IconUpload /> Upload Audio File</> }
          style={{ marginBottom: 16 }}
        >
          <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
            Upload a pre-recorded audio file for transcription (great for development testing!)
          </Text>

          <Upload
            accept="audio/*"
            showUploadList={false}
            beforeUpload={(file) => {
              processUploadedAudio(file)
              return false // Prevent automatic upload
            }}
            disabled={isProcessingAudioFile || isTranscribing}
          >
            <Button
              icon={<IconUpload />}
              loading={isProcessingAudioFile}
              disabled={isTranscribing}
            >
              {isProcessingAudioFile ? 'Processing...' : 'Upload Audio File'}
            </Button>
          </Upload>

          {uploadedAudioFile && (
            <Space style={{ marginTop: 8 }}>
              <Tag icon={<IconFile />} closable onClose={() => setUploadedAudioFile(null)}>
                {uploadedAudioFile.name}
              </Tag>
              <Button
                size="small"
                type="text"
                onClick={() => processUploadedAudio(uploadedAudioFile)}
              >
                Re-process
              </Button>
            </Space>
          )}
        </Card>

        {/* Text Input Section */}
        <Card
          size="small"
          title={<><IconEdit /> Brainstorm Text</> }
          style={{ marginBottom: 16 }}
        >
          <Text type="secondary" style={{ fontSize: 14 }}>
            {processingMode === AIProcessingMode.Workflows
              ? 'Describe your async workflows - mention sequences, dependencies, wait times, and handoffs.'
              : 'Edit the transcribed text or type directly. Include details about deadlines, priorities, and requirements.'
            }
          </Text>

          <TextArea
            value={brainstormText}
            onChange={setBrainstormText}
            placeholder={processingMode === AIProcessingMode.Workflows
              ? "Example: I need to run a workflow that will take a few hours to complete. After that I can check the results and submit for code review. Reviews usually take about a day, then I'll need to address feedback and re-submit..."
              : "Example: I need to finish the quarterly report by Friday, it's high priority. Also need to review the new marketing campaign designs and schedule team meetings for next week..."
            }
            rows={6}
            style={{ marginTop: 12 }}
            disabled={isProcessing}
          />
        </Card>

        {/* AI Processing Section */}
        <div>
          <Button
            type="primary"
            icon={<IconRobot />}
            onClick={processWithAI}
            loading={isProcessing}
            disabled={!brainstormText.trim() || isTranscribing}
            size="large"
          >
            {isProcessing
              ? 'Processing with Claude Opus 4.1...'
              : processingMode === AIProcessingMode.Workflows
                ? 'Generate Async Workflows'
                : 'Extract Simple Tasks'
            }
          </Button>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            Using Claude Opus 4.1 for enhanced async workflow understanding
          </Text>
        </div>

        {/* Error Display */}
        {error && (
          <Alert
            type="error"
            title="Error"
            content={error}
            showIcon
          />
        )}

        {/* Results Display */}
        {brainstormResult && (
          <Card
            title={
              <Space>
                <IconCheckCircle style={{ color: '#00b42a' }} />
                <span>
                  {showClarificationMode ? 'Provide Clarifications & Edit Details' : 'Claude Opus 4.1 Analysis Results'}
                </span>
              </Space>
            }
            style={{ marginTop: 16 }}
          >
            {showClarificationMode && (
              <Alert
                type="info"
                content="Review the items below. Where questions are highlighted, provide clarifications. You can also adjust durations, priorities, and other details."
                style={{ marginBottom: 16 }}
              />
            )}
            <Space direction="vertical" style={{ width: '100%' }} size="medium">
              <div>
                <Text style={{ fontWeight: 'bold' }}>Summary:</Text>
                <Text style={{ display: 'block', marginTop: 8 }}>
                  {brainstormResult.summary}
                </Text>
              </div>

              {/* Workflows Section */}
              {(showClarificationMode ? editableResult?.workflows : brainstormResult.workflows) &&
               (showClarificationMode ? editableResult?.workflows : brainstormResult.workflows)!.length > 0 && (
                <div>
                  <Text style={{ fontWeight: 'bold' }}>
                    Async Workflows ({(showClarificationMode ? editableResult?.workflows : brainstormResult.workflows)!.length}):
                  </Text>
                  <div style={{ marginTop: 12 }}>
                    {(showClarificationMode ? editableResult?.workflows : brainstormResult.workflows)!.map((workflow, index) => {
                      const displayWorkflow = showClarificationMode && editableResult?.workflows?.[index]
                        ? editableResult.workflows[index]
                        : workflow
                      return (
                      <Card
                        key={index}
                        size="small"
                        style={{ marginBottom: 16 }}
                        title={
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: 500 }}>
                              {displayWorkflow.name}
                            </Text>
                            <Space>
                              <Tag color={displayWorkflow.type === 'focused' ? 'blue' : 'green'} size="small">
                                {displayWorkflow.type === 'focused' ? 'Focused' : 'Admin'}
                              </Tag>
                              <Tag color="purple" size="small">
                                {displayWorkflow.steps.length} steps
                              </Tag>
                              {showClarificationMode && (
                                <Button
                                  size="mini"
                                  type="text"
                                  status="danger"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteWorkflow(index)
                                  }}
                                  title="Delete this workflow"
                                >
                                  ✕
                                </Button>
                              )}
                            </Space>
                          </Space>
                        }
                      >
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 14 }}>
                            {displayWorkflow.description}
                          </Text>

                          <Space wrap>
                            <Tag size="small" color="blue">
                              Active Work: {displayWorkflow.duration}min
                            </Tag>
                            <Tag size="small" color="green">
                              Earliest: {displayWorkflow.earliestCompletion}
                            </Tag>
                            <Tag size="small" color="orange">
                              Worst Case: {displayWorkflow.worstCaseCompletion}
                            </Tag>
                          </Space>

                          <div style={{ marginTop: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: 'bold' }}>Workflow Steps:</Text>
                            <div style={{ marginTop: 8 }}>
                              {displayWorkflow.steps.map((step: any, stepIndex: number) => (
                                <div
                                  key={stepIndex}
                                  style={{
                                    marginBottom: 8,
                                    padding: '8px 12px',
                                    backgroundColor: '#f7f8fa',
                                    borderRadius: 4,
                                    border: '1px solid #e5e6eb',
                                  }}
                                >
                                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 13, fontWeight: 500 }}>
                                      {stepIndex + 1}. {step.name}
                                    </Text>
                                    <Space>
                                      <Tag size="small" color={step.type === 'focused' ? 'blue' : 'green'}>
                                        {step.duration}min
                                      </Tag>
                                      {step.asyncWaitTime > 0 && (
                                        <Tag size="small" color="red">
                                          +{step.asyncWaitTime}min wait
                                        </Tag>
                                      )}
                                      {showClarificationMode && (
                                        <Button
                                          size="mini"
                                          type="text"
                                          status="danger"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteStep(index, stepIndex)
                                          }}
                                          title="Delete this step"
                                        >
                                          ✕
                                        </Button>
                                      )}
                                    </Space>
                                  </Space>
                                  {step.dependsOn && step.dependsOn.length > 0 && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      Depends on: {step.dependsOn.join(', ')}
                                    </Text>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {displayWorkflow.notes && (
                            <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f0f9ff', borderRadius: 4 }}>
                              <Text style={{ fontSize: 13 }}>
                                <span style={{ fontWeight: 'bold' }}>Notes:</span> {displayWorkflow.notes}
                              </Text>
                            </div>
                          )}

                          {/* Show clarification input when in clarification mode and there are questions/clarifications needed */}
                          {showClarificationMode && (displayWorkflow.notes?.toLowerCase().includes('clarification') ||
                                                     displayWorkflow.notes?.toLowerCase().includes('question') ||
                                                     displayWorkflow.notes?.toLowerCase().includes('need') ||
                                                     displayWorkflow.notes?.includes('?')) && (
                            <div style={{ marginTop: 8, padding: 12, backgroundColor: '#fff8e6', borderRadius: 4, border: '1px solid #ffdc64' }}>
                              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#fa8c16' }}>
                                Provide Clarification:
                              </Text>
                              <Input.TextArea
                                placeholder="Answer the questions or provide additional context..."
                                value={clarifications[`workflow-${index}`] || ''}
                                onChange={(value) => setClarifications({
                                  ...clarifications,
                                  [`workflow-${index}`]: value,
                                })}
                                style={{ marginTop: 8 }}
                                rows={3}
                              />
                              {appliedClarifications.has(`workflow-${index}`) && (
                                <Tag color="green" size="small" style={{ marginTop: 8 }}>
                                  <IconCheckCircle /> Clarification Applied
                                </Tag>
                              )}
                            </div>
                          )}
                          {showClarificationMode && (
                            <div style={{ marginTop: 12, padding: 8, backgroundColor: '#f9f9f9', borderRadius: 4 }}>
                              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>Quick Edits (Workflow-level):</Text>
                              <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                                <Space style={{ width: '100%' }}>
                                  <Text style={{ width: 80 }}>Importance:</Text>
                                  <Select
                                    size="small"
                                    value={editableResult?.workflows?.[index]?.importance || displayWorkflow.importance}
                                    onChange={(value) => handleEditField('workflow', index, 'importance', value)}
                                    style={{ flex: 1 }}
                                  >
                                    {[1,2,3,4,5,6,7,8,9,10].map(i => (
                                      <Select.Option key={i} value={i}>{i}</Select.Option>
                                    ))}
                                  </Select>
                                </Space>
                                <Space style={{ width: '100%' }}>
                                  <Text style={{ width: 80 }}>Urgency:</Text>
                                  <Select
                                    size="small"
                                    value={editableResult?.workflows?.[index]?.urgency || displayWorkflow.urgency}
                                    onChange={(value) => handleEditField('workflow', index, 'urgency', value)}
                                    style={{ flex: 1 }}
                                  >
                                    {[1,2,3,4,5,6,7,8,9,10].map(i => (
                                      <Select.Option key={i} value={i}>{i}</Select.Option>
                                    ))}
                                  </Select>
                                </Space>
                              </Space>

                              {/* Individual step editing */}
                              <Divider style={{ margin: '8px 0' }} />
                              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>Edit Individual Steps:</Text>
                              {displayWorkflow.steps.map((step: any, stepIndex: number) => (
                                <div key={stepIndex} style={{ marginTop: 8, padding: 8, backgroundColor: '#fff', borderRadius: 4 }}>
                                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                                    <Text style={{ fontSize: 11, fontWeight: 500 }}>Step {stepIndex + 1}: {step.name}</Text>
                                    <Space>
                                      <InputNumber
                                        size="small"
                                        value={editableResult?.workflows?.[index]?.steps?.[stepIndex]?.duration || step.duration}
                                        onChange={(value) => {
                                          if (!editableResult || !editableResult.workflows || !editableResult.workflows[index]) return
                                          const newResult = { ...editableResult }
                                          if (!newResult.workflows || !newResult.workflows[index] || !newResult.workflows[index].steps) return
                                          newResult.workflows[index].steps[stepIndex].duration = value as number
                                          setEditableResult(newResult)
                                        }}
                                        min={5}
                                        max={480}
                                        step={5}
                                        suffix="min"
                                        style={{ width: 100 }}
                                      />
                                      {step.asyncWaitTime > 0 && (
                                        <>
                                          <Text>Wait:</Text>
                                          <InputNumber
                                            size="small"
                                            value={editableResult?.workflows?.[index]?.steps?.[stepIndex]?.asyncWaitTime || step.asyncWaitTime}
                                            onChange={(value) => {
                                              if (!editableResult || !editableResult.workflows || !editableResult.workflows[index]) return
                                              const newResult = { ...editableResult }
                                              if (!newResult.workflows || !newResult.workflows[index] || !newResult.workflows[index].steps) return
                                              newResult.workflows[index].steps[stepIndex].asyncWaitTime = value as number
                                              setEditableResult(newResult)
                                            }}
                                            min={0}
                                            max={10080}
                                            step={15}
                                            suffix="min"
                                            style={{ width: 100 }}
                                          />
                                        </>
                                      )}
                                    </Space>
                                  </Space>
                                </div>
                              ))}
                            </div>
                          )}
                        </Space>
                      </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Standalone Tasks Section */}
              {(showClarificationMode ? editableResult?.standaloneTasks : brainstormResult.standaloneTasks) &&
               (showClarificationMode ? editableResult?.standaloneTasks : brainstormResult.standaloneTasks)!.length > 0 && (
                <div>
                  <Text style={{ fontWeight: 'bold' }}>
                    Standalone Tasks ({(showClarificationMode ? editableResult?.standaloneTasks : brainstormResult.standaloneTasks)!.length}):
                  </Text>
                  <div style={{ marginTop: 12 }}>
                    {(showClarificationMode ? editableResult?.standaloneTasks : brainstormResult.standaloneTasks)!.map((task, index) => {
                      const displayTask = showClarificationMode && editableResult?.standaloneTasks?.[index]
                        ? editableResult.standaloneTasks[index]
                        : task
                      return (
                      <Card
                        key={index}
                        size="small"
                        style={{ marginBottom: 12 }}
                        title={
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: 500 }}>
                              {displayTask.name}
                            </Text>
                            <Space>
                              {displayTask.needsMoreInfo && (
                                <Tag color="orange" size="small">
                                  Needs Info
                                </Tag>
                              )}
                              <Tag color={displayTask.type === 'focused' ? 'blue' : 'green'} size="small">
                                {displayTask.type === 'focused' ? 'Focused' : 'Admin'}
                              </Tag>
                            </Space>
                          </Space>
                        }
                      >
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 14 }}>
                            {displayTask.description}
                          </Text>
                          <Space wrap>
                            <Tag size="small">
                              {displayTask.estimatedDuration}min
                            </Tag>
                            <Tag size="small" color="red">
                              Priority: {displayTask.importance * displayTask.urgency}
                            </Tag>
                            <Tag size="small">
                              Importance: {displayTask.importance}/10
                            </Tag>
                            <Tag size="small">
                              Urgency: {displayTask.urgency}/10
                            </Tag>
                          </Space>

                          {/* Show clarification input for standalone tasks in clarification mode */}
                          {showClarificationMode && (displayTask.needsMoreInfo || true) && (
                            <div style={{ marginTop: 8, padding: 12, backgroundColor: '#fff8e6', borderRadius: 4, border: '1px solid #ffdc64' }}>
                              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#fa8c16' }}>
                                Provide Clarification:
                              </Text>
                              {task.clarificationRequest && (
                                <Text style={{ fontSize: 12, display: 'block', marginTop: 4, marginBottom: 8 }}>
                                  {task.clarificationRequest}
                                </Text>
                              )}
                              <Input.TextArea
                                placeholder="Provide additional details or answer questions..."
                                value={clarifications[`standalonetask-${index}`] || ''}
                                onChange={(value) => setClarifications({
                                  ...clarifications,
                                  [`standalonetask-${index}`]: value,
                                })}
                                style={{ marginTop: 8 }}
                                rows={2}
                              />
                              {appliedClarifications.has(`standalonetask-${index}`) && (
                                <Tag color="green" size="small" style={{ marginTop: 8 }}>
                                  <IconCheckCircle /> Clarification Applied
                                </Tag>
                              )}
                            </div>
                          )}

                          {/* Quick edits for standalone tasks in clarification mode */}
                          {showClarificationMode && (
                            <div style={{ marginTop: 12, padding: 8, backgroundColor: '#f9f9f9', borderRadius: 4 }}>
                              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>Quick Edits:</Text>
                              <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size="small">
                                <Space>
                                  <Text style={{ width: 80 }}>Duration:</Text>
                                  <InputNumber
                                    size="small"
                                    value={editableResult?.standaloneTasks?.[index]?.estimatedDuration || task.estimatedDuration}
                                    onChange={(value) => {
                                      if (!editableResult) return
                                      const newResult = { ...editableResult }
                                      if (!newResult.standaloneTasks) newResult.standaloneTasks = []
                                      newResult.standaloneTasks[index] = {
                                        ...newResult.standaloneTasks[index],
                                        estimatedDuration: value as number,
                                      }
                                      setEditableResult(newResult)
                                    }}
                                    min={5}
                                    max={480}
                                    step={5}
                                    suffix="min"
                                    style={{ flex: 1 }}
                                  />
                                </Space>
                                <Space>
                                  <Text style={{ width: 80 }}>Importance:</Text>
                                  <Select
                                    size="small"
                                    value={editableResult?.standaloneTasks?.[index]?.importance || task.importance}
                                    onChange={(value) => {
                                      if (!editableResult) return
                                      const newResult = { ...editableResult }
                                      if (!newResult.standaloneTasks) newResult.standaloneTasks = []
                                      newResult.standaloneTasks[index] = {
                                        ...newResult.standaloneTasks[index],
                                        importance: value,
                                      }
                                      setEditableResult(newResult)
                                    }}
                                    style={{ flex: 1 }}
                                  >
                                    {[1,2,3,4,5,6,7,8,9,10].map(i => (
                                      <Select.Option key={i} value={i}>{i}</Select.Option>
                                    ))}
                                  </Select>
                                </Space>
                                <Space>
                                  <Text style={{ width: 80 }}>Urgency:</Text>
                                  <Select
                                    size="small"
                                    value={editableResult?.standaloneTasks?.[index]?.urgency || task.urgency}
                                    onChange={(value) => {
                                      if (!editableResult) return
                                      const newResult = { ...editableResult }
                                      if (!newResult.standaloneTasks) newResult.standaloneTasks = []
                                      newResult.standaloneTasks[index] = {
                                        ...newResult.standaloneTasks[index],
                                        urgency: value,
                                      }
                                      setEditableResult(newResult)
                                    }}
                                    style={{ flex: 1 }}
                                  >
                                    {[1,2,3,4,5,6,7,8,9,10].map(i => (
                                      <Select.Option key={i} value={i}>{i}</Select.Option>
                                    ))}
                                  </Select>
                                </Space>
                              </Space>
                            </div>
                          )}
                        </Space>
                      </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Legacy Tasks Section (for task-only mode) */}
              {(showClarificationMode ? editableResult?.tasks : brainstormResult.tasks) &&
               (showClarificationMode ? editableResult?.tasks : brainstormResult.tasks)!.length > 0 && (
                <div>
                  <Text style={{ fontWeight: 'bold' }}>
                    Extracted Tasks ({(showClarificationMode ? editableResult?.tasks : brainstormResult.tasks)!.length}):
                  </Text>
                  <div style={{ marginTop: 12 }}>
                    {(showClarificationMode ? editableResult?.tasks : brainstormResult.tasks)!.map((task, index) => (
                      <Card
                        key={index}
                        size="small"
                        style={{ marginBottom: 12 }}
                        title={
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: 500 }}>
                              {task.name}
                            </Text>
                            <Space>
                              {task.needsMoreInfo && (
                                <Tag color="orange" size="small">
                                  Needs Info
                                </Tag>
                              )}
                              <Tag color={task.type === 'focused' ? 'blue' : 'green'} size="small">
                                {task.type === 'focused' ? 'Focused' : 'Admin'}
                              </Tag>
                              {showClarificationMode && (
                                <Button
                                  size="mini"
                                  type="text"
                                  status="danger"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteTask(index)
                                  }}
                                  title="Delete this task"
                                >
                                  ✕
                                </Button>
                              )}
                            </Space>
                          </Space>
                        }
                      >
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 14 }}>
                            {task.description}
                          </Text>
                          <Space wrap>
                            <Tag size="small">
                              {task.estimatedDuration}min
                            </Tag>
                            <Tag size="small" color="red">
                              Priority: {task.importance * task.urgency}
                            </Tag>
                            <Tag size="small">
                              Importance: {task.importance}/10
                            </Tag>
                            <Tag size="small">
                              Urgency: {task.urgency}/10
                            </Tag>
                          </Space>
                        </Space>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'center', paddingTop: 16 }}>
                {/* Show global clarification info when in clarification mode */}
                {showClarificationMode && Object.keys(clarifications).filter(k => clarifications[k]?.trim()).length > 0 && (
                  <Alert
                    type="info"
                    content={`${Object.keys(clarifications).filter(k => clarifications[k]?.trim()).length} clarification(s) pending. Click "Apply All Clarifications" to regenerate items.`}
                    style={{ marginBottom: 12, textAlign: 'left' }}
                  />
                )}

                <Space>
                  <Button onClick={onClose}>
                    Cancel
                  </Button>
                  {(brainstormResult.workflows?.some(w =>
                      w.notes?.toLowerCase().includes('clarification') ||
                      w.notes?.toLowerCase().includes('question') ||
                      w.notes?.toLowerCase().includes('need to clarify') ||
                      w.notes?.includes('?')) ||
                    brainstormResult.tasks?.some(t => t.needsMoreInfo) ||
                    brainstormResult.standaloneTasks?.some(t => t.needsMoreInfo)) &&
                   !showClarificationMode && (
                    <Button onClick={handleProvideClarifications}>
                      Answer Questions / Provide Clarifications
                    </Button>
                  )}

                  {/* Single button to apply all clarifications */}
                  {showClarificationMode && Object.keys(clarifications).filter(k => clarifications[k]?.trim()).length > 0 && (
                    <Button
                      type="primary"
                      onClick={handleRegenerateAllWithClarifications}
                      loading={regeneratingItems.size > 0}
                      icon={<IconRefresh />}
                    >
                      Apply All Clarifications ({Object.keys(clarifications).filter(k => clarifications[k]?.trim()).length})
                    </Button>
                  )}

                  <Button
                    onClick={() => {
                      setBrainstormResult(null)
                      setEditableResult(null)
                      setShowClarificationMode(false)
                      setClarifications({})
                      setAppliedClarifications(new Set())
                    }}
                  >
                    Try Again
                  </Button>
                  <Button type="primary" onClick={handleUseResults}>
                    {showClarificationMode ? 'Use Edited Results' :
                     brainstormResult.workflows && brainstormResult.workflows.length > 0
                      ? 'Create Workflows & Tasks'
                      : 'Use These Tasks'
                    }
                  </Button>
                </Space>
              </div>
            </Space>
          </Card>
        )}
      </Space>
    </Modal>
  )
}
