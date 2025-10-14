import { useState, useRef, useEffect } from 'react'
import { Modal, Button, Typography, Alert, Space, Card, Tag, Spin, List, Badge, Input, Upload, Slider, InputNumber, Select, DatePicker } from '@arco-design/web-react'
import { IconSoundFill, IconStop, IconRefresh, IconCheck, IconClose, IconEdit, IconClockCircle, IconFile, IconSchedule, IconMessage, IconPlus, IconLink, IconUpload, IconInfoCircle, IconExclamationCircle, IconMinus, IconBranch } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import {
  Amendment,
  AmendmentResult,
  AmendmentContext,
  AmendmentType,
  StatusUpdate,
  TimeLog,
  NoteAddition,
  DurationChange,
  StepAddition,
  StepRemoval,
  TaskCreation,
  DependencyChange,
  DeadlineChange,
  PriorityChange,
  TypeChange,
  TaskType,
} from '../../../shared/amendment-types'
import { useTaskStore } from '../../store/useTaskStore'
import { logger } from '@/logger'
import { DependencyEditor } from '../shared/DependencyEditor'
import { applyAmendments } from '../../utils/amendment-applicator'


const { Title, Text, Paragraph } = Typography

// Helper to normalize amendment type from string or enum to enum
// IPC serialization converts enums to strings, so we need to handle both
const normalizeAmendmentType = (type: string | AmendmentType): AmendmentType => {
  // If it's already an enum value, return it
  if (Object.values(AmendmentType).includes(type as AmendmentType)) {
    return type as AmendmentType
  }

  // Map string literals to enum values
  const typeMap: Record<string, AmendmentType> = {
    'status_update': AmendmentType.StatusUpdate,
    'time_log': AmendmentType.TimeLog,
    'note_addition': AmendmentType.NoteAddition,
    'duration_change': AmendmentType.DurationChange,
    'step_addition': AmendmentType.StepAddition,
    'step_removal': AmendmentType.StepRemoval,
    'dependency_change': AmendmentType.DependencyChange,
    'task_creation': AmendmentType.TaskCreation,
    'workflow_creation': AmendmentType.WorkflowCreation,
    'deadline_change': AmendmentType.DeadlineChange,
    'priority_change': AmendmentType.PriorityChange,
    'type_change': AmendmentType.TypeChange,
  }

  return typeMap[type] || (type as AmendmentType)
}

interface VoiceAmendmentModalProps {
  visible: boolean
  onClose: () => void
  onAmendmentsApplied?: (__amendments: Amendment[]) => void
  activeTaskId?: string
  activeWorkflowId?: string
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

export function VoiceAmendmentModal({
  visible,
  onClose,
  onAmendmentsApplied,
  activeTaskId,
  activeWorkflowId,
}: VoiceAmendmentModalProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [amendmentResult, setAmendmentResult] = useState<AmendmentResult | null>(null)
  const [selectedAmendments, setSelectedAmendments] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [textInput, setTextInput] = useState('')
  const [useTextInput, setUseTextInput] = useState(false)
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null)
  const [isProcessingAudioFile, setIsProcessingAudioFile] = useState(false)
  const [contextText, setContextText] = useState('')
  const [showEditMode, setShowEditMode] = useState(false)
  const [editedAmendments, setEditedAmendments] = useState<Map<number, any>>(new Map())

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  const { tasks, sequencedTasks } = useTaskStore()

  // Stop recording when component unmounts or modal closes
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && recordingState !== 'idle') {
        mediaRecorderRef.current.stop()
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [recordingState])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        await processAudioBlob(audioBlob)

        // Clean up
        stream.getTracks().forEach(track => track.stop())
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        setRecordingDuration(0)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(100) // Collect data every 100ms
      setRecordingState('recording')
      setError(null)

      // Start duration timer
      const startTime = Date.now()
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000))
      }, 1000)

    } catch (err) {
      setError('Failed to start recording. Please check your microphone permissions.')
      logger.ui.error('Error starting recording', {
        error: err instanceof Error ? err.message : String(err),
      }, 'voice-record-error')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop()
      setRecordingState('stopped')
    }
  }

  const processAudioBlob = async (audioBlob: Blob) => {
    setIsTranscribing(true)
    setError(null)

    try {
      // Convert blob to array buffer first
      const arrayBuffer = await audioBlob.arrayBuffer()
      // Convert ArrayBuffer to Uint8Array (works in browser)
      const uint8Array = new Uint8Array(arrayBuffer)
      const filename = `amendment-${Date.now()}.${audioBlob.type.includes('mp4') ? 'mp4' : 'webm'}`

      // Transcribe directly with the audio data
      const transcriptionResult = await getDatabase().transcribeAudioBuffer(
        uint8Array as any, // The IPC will handle the conversion
        filename,
        { prompt: 'Task amendment: status update, time logging, or notes' },
      )

      setTranscription(transcriptionResult.text)

      // Parse the transcription
      await parseTranscription(transcriptionResult.text)

    } catch (err) {
      setError('Failed to process audio. Please try again.')
      logger.ui.error('Error processing audio', {
        error: err instanceof Error ? err.message : String(err),
      }, 'voice-process-error')
    } finally {
      setIsTranscribing(false)
    }
  }

  const parseTranscription = async (text: string) => {
    setIsParsing(true)
    setError(null)

    try {
      // Build context for parser with enhanced workflow details
      const context: AmendmentContext = {
        activeTaskId: activeTaskId,
        activeWorkflowId: activeWorkflowId,
        recentTasks: tasks.slice(0, 10).map(t => ({
          id: t.id,
          name: t.name,
        })),
        recentWorkflows: sequencedTasks.slice(0, 10).map(w => ({
          id: w.id,
          name: w.name,
          steps: w.steps?.map(s => ({ name: s.name, id: s.id })) || [],
        })),
        currentView: 'tasks',
      }

      // Parse with AI via IPC, including any additional context
      const fullText = contextText ? `${text}\n\nAdditional context: ${contextText}` : text
      // logger.ui.debug('[VoiceAmendmentModal] Sending to parse:', fullText, 'Context:', context)
      const result = await window.electronAPI.ai.parseAmendment(fullText, context)
      // logger.ui.debug('[VoiceAmendmentModal] Received parse result:', result)
      setAmendmentResult(result)

      // Auto-select all amendments with high confidence
      const highConfidenceIndices = new Set<number>()
      result.amendments.forEach((amendment, index) => {
        if ('target' in amendment && amendment.target.confidence > 0.7) {
          highConfidenceIndices.add(index)
        } else if ('workflowTarget' in amendment && (amendment as any).workflowTarget.confidence > 0.7) {
          highConfidenceIndices.add(index)
        }
      })
      setSelectedAmendments(highConfidenceIndices)

    } catch (err) {
      setError('Failed to parse amendments. Please try rephrasing.')
      logger.ui.error('Error parsing transcription', {
        error: err instanceof Error ? err.message : String(err),
      }, 'voice-parse-error')
    } finally {
      setIsParsing(false)
    }
  }

  const toggleAmendmentSelection = (index: number) => {
    const newSelection = new Set(selectedAmendments)
    if (newSelection.has(index)) {
      newSelection.delete(index)
    } else {
      newSelection.add(index)
    }
    setSelectedAmendments(newSelection)
  }

  const applySelectedAmendments = async () => {
    if (!amendmentResult || selectedAmendments.size === 0) return

    const amendmentsToApply = amendmentResult.amendments.filter((_, index) =>
      selectedAmendments.has(index),
    ).map((amendment) => {
      // Find the actual index in the full array
      const actualIndex = amendmentResult.amendments.indexOf(amendment)
      const edits = editedAmendments.get(actualIndex)
      if (!edits) return amendment

      // Apply edits based on amendment type
      const edited = { ...amendment }
      if (amendment.type === AmendmentType.TimeLog && edits.duration !== undefined) {
        (edited as TimeLog).duration = edits.duration
      }
      if (amendment.type === AmendmentType.DurationChange && edits.duration !== undefined) {
        (edited as DurationChange).newDuration = edits.duration
      }
      if (amendment.type === AmendmentType.TaskCreation) {
        const taskCreation = edited as TaskCreation
        if (edits.duration !== undefined) taskCreation.duration = edits.duration
        if (edits.importance !== undefined) taskCreation.importance = edits.importance
        if (edits.urgency !== undefined) taskCreation.urgency = edits.urgency
        if (edits.taskType !== undefined) taskCreation.taskType = edits.taskType
        if (edits.description !== undefined) taskCreation.description = edits.description
      }
      if (amendment.type === AmendmentType.NoteAddition && edits.note !== undefined) {
        (edited as NoteAddition).note = edits.note
      }
      if (amendment.type === AmendmentType.StepAddition) {
        const stepAddition = edited as StepAddition
        if (edits.stepName !== undefined) stepAddition.stepName = edits.stepName
        if (edits.duration !== undefined) stepAddition.duration = edits.duration
        if (edits.stepType !== undefined) stepAddition.stepType = edits.stepType
        if (edits.dependencies !== undefined) stepAddition.dependencies = edits.dependencies
      }
      if (amendment.type === AmendmentType.DeadlineChange) {
        const deadlineChange = edited as DeadlineChange
        if (edits.newDeadline !== undefined) deadlineChange.newDeadline = edits.newDeadline
        if (edits.deadlineType !== undefined) deadlineChange.deadlineType = edits.deadlineType
      }
      if (amendment.type === AmendmentType.PriorityChange) {
        const priorityChange = edited as PriorityChange
        if (edits.importance !== undefined) priorityChange.importance = edits.importance
        if (edits.urgency !== undefined) priorityChange.urgency = edits.urgency
        if (edits.cognitiveComplexity !== undefined) priorityChange.cognitiveComplexity = edits.cognitiveComplexity
      }
      if (amendment.type === AmendmentType.TypeChange) {
        const typeChange = edited as TypeChange
        if (edits.newType !== undefined) typeChange.newType = edits.newType
      }
      if (amendment.type === AmendmentType.DependencyChange) {
        const depChange = edited as DependencyChange
        if (edits.addDependencies !== undefined) depChange.addDependencies = edits.addDependencies
        if (edits.removeDependencies !== undefined) depChange.removeDependencies = edits.removeDependencies
        if (edits.addDependents !== undefined) depChange.addDependents = edits.addDependents
        if (edits.removeDependents !== undefined) depChange.removeDependents = edits.removeDependents
      }
      return edited
    })

    try {
      // Apply the amendments using the amendment applicator
      await applyAmendments(amendmentsToApply)

      // Notify parent if needed
      onAmendmentsApplied?.(amendmentsToApply)

      // UI refresh will be triggered automatically by DATA_REFRESH_NEEDED event from applyAmendments

      handleClose()
    } catch (err) {
      setError('Failed to apply amendments')
      logger.ui.error('Error applying amendments', {
        error: err instanceof Error ? err.message : String(err),
      }, 'voice-apply-error')
    }
  }

  const handleClose = () => {
    // Reset state
    setRecordingState('idle')
    setTranscription('')
    setAmendmentResult(null)
    setSelectedAmendments(new Set())
    setError(null)
    setRecordingDuration(0)
    setUploadedAudioFile(null)
    setIsProcessingAudioFile(false)
    setContextText('')
    setShowEditMode(false)
    setEditedAmendments(new Map())
    onClose()
  }

  const handleAudioFileUpload = async (file: File) => {
    setUploadedAudioFile(file)
    setIsProcessingAudioFile(true)
    setError(null)

    try {
      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // Transcribe the audio file
      const transcriptionResult = await getDatabase().transcribeAudioBuffer(
        uint8Array as any,
        file.name,
        { prompt: 'Task amendment: status update, time logging, notes, or task modifications' },
      )

      setTranscription(transcriptionResult.text)

      // Parse the transcription
      await parseTranscription(transcriptionResult.text)
    } catch (err) {
      setError('Failed to process audio file. Please try again.')
      logger.ui.error('Error processing uploaded audio file', {
        error: err instanceof Error ? err.message : String(err),
      }, 'voice-upload-error')
    } finally {
      setIsProcessingAudioFile(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const renderAmendmentIcon = (type: Amendment['type']) => {
    // Normalize to enum value for consistent handling
    const enumType = normalizeAmendmentType(type)

    switch (enumType) {
      case AmendmentType.StatusUpdate:
        return <IconCheck />
      case AmendmentType.TimeLog:
        return <IconClockCircle />
      case AmendmentType.NoteAddition:
        return <IconFile />
      case AmendmentType.DurationChange:
        return <IconSchedule />
      case AmendmentType.StepAddition:
        return <IconEdit />
      case AmendmentType.TaskCreation:
        return <IconPlus />
      case AmendmentType.DependencyChange:
        return <IconLink />
      case AmendmentType.DeadlineChange:
        return <IconClockCircle />
      case AmendmentType.PriorityChange:
        return <IconExclamationCircle />
      case AmendmentType.TypeChange:
        return <IconRefresh />
      case AmendmentType.StepRemoval:
        return <IconMinus />
      case AmendmentType.WorkflowCreation:
        return <IconBranch />
      default:
        logger.ui.warn('Unknown amendment type in icon', {
          type,
        }, 'voice-unknown-type')
        return <IconEdit />
    }
  }

  const renderAmendmentDescription = (amendment: Amendment, allAmendments?: Amendment[]) => {
    // Normalize to enum value for consistent handling
    const enumType = normalizeAmendmentType(amendment.type)

    switch (enumType) {
      case AmendmentType.StatusUpdate: {
        const statusUpdate = amendment as StatusUpdate
        return (
          <Space>
            <Text>Mark</Text>
            <Text bold>{statusUpdate.target.name}</Text>
            <Text>as</Text>
            <Tag color={statusUpdate.newStatus === 'completed' ? 'green' : 'blue'}>
              {statusUpdate.newStatus.replace('_', ' ')}
            </Tag>
          </Space>
        )
      }
      case AmendmentType.TimeLog: {
        const timeLog = amendment as TimeLog
        return (
          <Space>
            <Text>Log</Text>
            <Text bold>{timeLog.duration} minutes</Text>
            <Text>on</Text>
            <Text bold>{timeLog.target.name}</Text>
          </Space>
        )
      }
      case AmendmentType.NoteAddition: {
        const noteAddition = amendment as NoteAddition
        return (
          <Space direction="vertical" size={4}>
            <Space>
              <Text>Add note to</Text>
              <Text bold>{noteAddition.target.name}</Text>
            </Space>
            <Text type="secondary" style={{ fontStyle: 'italic' }}>
              {`"${noteAddition.note}"`}
            </Text>
          </Space>
        )
      }
      case AmendmentType.DurationChange: {
        const durationChange = amendment as DurationChange
        return (
          <Space>
            <Text>Change duration of</Text>
            <Text bold>{durationChange.target.name}</Text>
            <Text>to</Text>
            <Text bold>{durationChange.newDuration} minutes</Text>
          </Space>
        )
      }
      case AmendmentType.StepAddition: {
        const stepAddition = amendment as StepAddition
        return (
          <Space direction="vertical" size={4}>
            <Space>
              <Text>Add step to</Text>
              <Text bold>{stepAddition.workflowTarget?.name || 'workflow'}</Text>
            </Space>
            <Space>
              <Text>Step:</Text>
              <Text bold>{stepAddition.stepName}</Text>
              <Text>({stepAddition.duration} min, {stepAddition.stepType})</Text>
            </Space>
            {stepAddition.afterStep && (
              <Text type="secondary">After: {stepAddition.afterStep}</Text>
            )}
          </Space>
        )
      }
      case AmendmentType.TaskCreation: {
        const taskCreation = amendment as TaskCreation
        return (
          <Space direction="vertical" size={4}>
            <Space>
              <Text>Create new task:</Text>
              <Text bold>{taskCreation.name}</Text>
            </Space>
            <Space>
              <Text>Duration:</Text>
              <Text bold>{taskCreation.duration} minutes</Text>
              {taskCreation.taskType && (
                <>
                  <Text>Type:</Text>
                  <Tag color={taskCreation.taskType === TaskType.Focused ? 'blue' : 'green'}>
                    {taskCreation.taskType === TaskType.Focused ? 'Focused' : 'Admin'}
                  </Tag>
                </>
              )}
            </Space>
            {taskCreation.description && (
              <Text type="secondary" style={{ fontStyle: 'italic' }}>
                {taskCreation.description}
              </Text>
            )}
          </Space>
        )
      }
      case AmendmentType.DependencyChange: {
        const depChange = amendment as DependencyChange
        return (
          <Space direction="vertical" size={4}>
            <Space>
              <Text>Update dependencies for</Text>
              <Text bold>{depChange.target.name}</Text>
            </Space>
            {depChange.addDependencies && depChange.addDependencies.length > 0 && (
              <Space>
                <Text>Add dependencies:</Text>
                <Text bold>
                  {depChange.addDependencies.map(dep => {
                    // Handle both old and new placeholder formats
                    // Old format: {{task_creation_0}}
                    // New format: task-new-1
                    const placeholderMatch = dep.match(/\{\{task_creation_(\d+)\}\}/) ||
                                           dep.match(/task[-_]new[-_](\d+)/)

                    if (placeholderMatch && allAmendments) {
                      // Extract the index from either format
                      const indexStr = placeholderMatch[1]
                      const taskIndex = dep.includes('{{') ? parseInt(indexStr) : parseInt(indexStr) - 1

                      // Find the corresponding task creation amendment
                      const taskCreations = allAmendments.filter(a =>
                        a.type === AmendmentType.TaskCreation || (a.type as string) === 'task_creation',
                      )
                      const taskCreation = taskCreations[taskIndex] as TaskCreation
                      return taskCreation ? taskCreation.name : dep
                    }
                    // For existing tasks, could resolve the name here if we had the task list
                    return dep
                  }).join(', ')}
                </Text>
              </Space>
            )}
            {depChange.removeDependencies && depChange.removeDependencies.length > 0 && (
              <Space>
                <Text>Remove dependencies:</Text>
                <Text bold>{depChange.removeDependencies.join(', ')}</Text>
              </Space>
            )}
            {depChange.stepName && (
              <Text type="secondary">Step: {depChange.stepName}</Text>
            )}
          </Space>
        )
      }
      case AmendmentType.DeadlineChange: {
        const deadlineChange = amendment as DeadlineChange
        return (
          <Space>
            <Text>Set deadline for</Text>
            <Text bold>{deadlineChange.target.name}</Text>
            <Text>to</Text>
            <Text bold>{new Date(deadlineChange.newDeadline).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}</Text>
            {deadlineChange.deadlineType && (
              <Tag color={deadlineChange.deadlineType === 'hard' ? 'red' : 'orange'}>
                {deadlineChange.deadlineType}
              </Tag>
            )}
            {deadlineChange.stepName && (
              <Text type="secondary">Step: {deadlineChange.stepName}</Text>
            )}
          </Space>
        )
      }
      case AmendmentType.PriorityChange: {
        const priorityChange = amendment as PriorityChange
        const changes: string[] = []
        if (priorityChange.importance !== undefined) changes.push(`Importance: ${priorityChange.importance}`)
        if (priorityChange.urgency !== undefined) changes.push(`Urgency: ${priorityChange.urgency}`)
        if (priorityChange.cognitiveComplexity !== undefined) changes.push(`Complexity: ${priorityChange.cognitiveComplexity}`)

        return (
          <Space>
            <Text>Update priority for</Text>
            <Text bold>{priorityChange.target.name}</Text>
            {changes.length > 0 && (
              <Text>({changes.join(', ')})</Text>
            )}
            {priorityChange.stepName && (
              <Text type="secondary">Step: {priorityChange.stepName}</Text>
            )}
          </Space>
        )
      }
      case AmendmentType.TypeChange: {
        const typeChange = amendment as TypeChange
        return (
          <Space>
            <Text>Change type of</Text>
            <Text bold>{typeChange.target.name}</Text>
            <Text>to</Text>
            <Tag color={typeChange.newType === 'focused' ? 'purple' : typeChange.newType === 'admin' ? 'blue' : 'green'}>
              {typeChange.newType}
            </Tag>
            {typeChange.stepName && (
              <Text type="secondary">Step: {typeChange.stepName}</Text>
            )}
          </Space>
        )
      }
      case AmendmentType.StepRemoval: {
        const stepRemoval = amendment as StepRemoval
        return (
          <Space>
            <Text>Remove step</Text>
            <Text bold>{stepRemoval.stepName}</Text>
            <Text>from</Text>
            <Text bold>{stepRemoval.workflowTarget.name}</Text>
            {stepRemoval.reason && (
              <Text type="secondary">Reason: {stepRemoval.reason}</Text>
            )}
          </Space>
        )
      }
      case AmendmentType.WorkflowCreation: {
        const workflowCreation = amendment as any // WorkflowCreation type
        return (
          <Space direction="vertical" size={4}>
            <Space>
              <Text>Create workflow:</Text>
              <Text bold>{workflowCreation.name}</Text>
            </Space>
            <Text type="secondary">Steps: {workflowCreation.steps?.length || 0}</Text>
            <Text type="secondary">
              Priority: {workflowCreation.importance || 'Default'}/{workflowCreation.urgency || 'Default'}
            </Text>
            {workflowCreation.steps && workflowCreation.steps.length > 0 && (
              <div style={{ marginLeft: 16 }}>
                {workflowCreation.steps.slice(0, 3).map((step: any, index: number) => (
                  <Text key={index} type="secondary" style={{ display: 'block' }}>
                    • {step.name} ({step.duration}m)
                  </Text>
                ))}
                {workflowCreation.steps.length > 3 && (
                  <Text type="secondary">... and {workflowCreation.steps.length - 3} more steps</Text>
                )}
              </div>
            )}
          </Space>
        )
      }
      default:
        logger.ui.error('Unknown amendment type', {
          type: amendment.type,
          fullAmendment: amendment,
        }, 'voice-unknown-amendment')
        return <Text>Unknown amendment type: {String(amendment.type)}</Text>
    }
  }

  const getAmendmentConfidence = (amendment: Amendment) => {
    if ('target' in amendment) {
      return amendment.target.confidence
    }
    if ('workflowTarget' in amendment) {
      return (amendment as any).workflowTarget.confidence
    }
    return 0.5
  }

  // Helper to check amendment types with normalized enum values
  const isAmendmentType = (amendment: Amendment, ...types: AmendmentType[]): boolean => {
    const enumType = normalizeAmendmentType(amendment.type)
    return types.includes(enumType)
  }

  const getAmendmentTitle = (amendment: Amendment) => {
    // Normalize to enum value for consistent handling
    const enumType = normalizeAmendmentType(amendment.type)

    switch (enumType) {
      case AmendmentType.StatusUpdate:
        return 'Status Update'
      case AmendmentType.TimeLog:
        return 'Time Log'
      case AmendmentType.NoteAddition:
        return 'Note Addition'
      case AmendmentType.DurationChange:
        return 'Duration Change'
      case AmendmentType.StepAddition:
        return 'Step Addition'
      case AmendmentType.TaskCreation:
        return 'Task Creation'
      case AmendmentType.DependencyChange:
        return 'Dependency Change'
      case AmendmentType.WorkflowCreation:
        return 'Workflow Creation'
      case AmendmentType.DeadlineChange:
        return 'Deadline Change'
      case AmendmentType.PriorityChange:
        return 'Priority Change'
      case AmendmentType.TypeChange:
        return 'Type Change'
      case AmendmentType.StepRemoval:
        return 'Step Removal'
      default:
        return 'Amendment'
    }
  }

  return (
    <Modal
      title={
        <Space>
          <IconSoundFill style={{ color: 'rgb(var(--primary-6))' }} />
          <span>Voice Amendment</span>
        </Space>
      }
      visible={visible}
      onCancel={handleClose}
      footer={null}
      style={{ width: 700 }}
      maskClosable={false}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Recording Section */}
        <Card>
          <Space direction="vertical" style={{ width: '100%' }} size="medium">
            <Title heading={6}>Record Your Amendment</Title>

            <Paragraph type="secondary">
              Speak naturally about what you want to update. For example:
              <ul style={{ marginTop: 8 }}>
                <li>{'Mark the API implementation as complete'}</li>
                <li>{'I spent 2 hours on code review'}</li>
                <li>{'Add note: waiting for design approval'}</li>
                <li>{'The database migration will take 4 hours not 2'}</li>
                <li>{'Add a code review step after implementation'}</li>
              </ul>
            </Paragraph>

            {/* Context Input Section */}
            <Card style={{ backgroundColor: 'rgb(var(--gray-1))' }}>
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Space>
                  <IconInfoCircle />
                  <Text bold>Additional Context (Optional)</Text>
                </Space>
                <Input.TextArea
                  placeholder="Provide any additional context that might help the AI understand your amendments better..."
                  value={contextText}
                  onChange={setContextText}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  style={{ width: '100%' }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Add context about your work environment, project specifics, or clarify terminology
                </Text>
              </Space>
            </Card>

            {/* Input Method Toggle */}
            <Space direction="vertical" style={{ width: '100%' }} size="medium">
              <Space>
                <Button
                  type={!useTextInput ? 'primary' : 'default'}
                  icon={<IconSoundFill />}
                  onClick={() => setUseTextInput(false)}
                >
                  Voice Input
                </Button>
                <Button
                  type={useTextInput ? 'primary' : 'default'}
                  icon={<IconMessage />}
                  onClick={() => setUseTextInput(true)}
                >
                  Text Input
                </Button>
              </Space>

              {/* Voice Recording Controls */}
              {!useTextInput && (
                <Space direction="vertical" style={{ width: '100%' }} size="medium">
                  <Space size="medium">
                    {recordingState === 'idle' && (
                      <>
                        <Button
                          type="primary"
                          icon={<IconSoundFill />}
                          onClick={startRecording}
                          size="large"
                        >
                          Start Recording
                        </Button>
                        <Upload
                          accept="audio/*"
                          showUploadList={false}
                          beforeUpload={(file) => {
                            handleAudioFileUpload(file)
                            return false // Prevent default upload behavior
                          }}
                        >
                          <Button
                            icon={<IconUpload />}
                            size="large"
                          >
                            Upload Audio File
                          </Button>
                        </Upload>
                      </>
                    )}

              {recordingState === 'recording' && (
                <>
                  <Button
                    type="primary"
                    status="danger"
                    icon={<IconStop />}
                    onClick={stopRecording}
                    size="large"
                  >
                    Stop Recording
                  </Button>
                  <Badge count={formatDuration(recordingDuration)} style={{ backgroundColor: 'rgb(var(--danger-6))' }}>
                    <div style={{ width: 1, height: 32 }} />
                  </Badge>
                </>
              )}

              {recordingState === 'stopped' && !isTranscribing && !amendmentResult && (
                <Button
                  icon={<IconRefresh />}
                  onClick={() => {
                    setRecordingState('idle')
                    setTranscription('')
                    setError(null)
                  }}
                >
                  Record Again
                </Button>
              )}
                  </Space>

                  {/* Show uploaded file info */}
                  {uploadedAudioFile && (
                    <Alert
                      type="info"
                      content={`Processing: ${uploadedAudioFile.name}`}
                      closable={false}
                    />
                  )}
                </Space>
              )}

              {/* Text Input */}
              {useTextInput && (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Input.TextArea
                    placeholder={"Type your amendment here... (e.g., 'Mark API implementation as complete')"}
                    value={textInput}
                    onChange={setTextInput}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    style={{ width: '100%' }}
                  />
                  <Button
                    type="primary"
                    icon={<IconCheck />}
                    onClick={() => {
                      if (textInput.trim()) {
                        setTranscription(textInput)
                        parseTranscription(textInput)
                      }
                    }}
                    disabled={!textInput.trim() || isParsing}
                  >
                    Process Amendment
                  </Button>
                </Space>
              )}
            </Space>

            {(isTranscribing || isProcessingAudioFile) && (
              <Space>
                <Spin />
                <Text>{isProcessingAudioFile ? 'Processing audio file...' : 'Transcribing audio...'}</Text>
              </Space>
            )}

            {isParsing && (
              <Space>
                <Spin />
                <Text>Understanding your request...</Text>
              </Space>
            )}
          </Space>
        </Card>

        {/* Transcription Display */}
        {transcription && (
          <Card>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Title heading={6}>Transcription</Title>
              <Alert type="info" content={transcription} />
            </Space>
          </Card>
        )}

        {/* Parsed Amendments */}
        {amendmentResult && amendmentResult.amendments.length > 0 && (
          <Card>
            <Space direction="vertical" style={{ width: '100%' }} size="medium">
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Title heading={6}>Detected Changes</Title>
                <Text type="secondary">
                  Confidence: {Math.round(amendmentResult.confidence * 100)}%
                </Text>
              </Space>

              <List
                dataSource={amendmentResult.amendments}
                render={(amendment, index) => (
                  <List.Item
                    key={index}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      backgroundColor: selectedAmendments.has(index) ? 'rgb(var(--primary-1))' : 'transparent',
                      borderRadius: 4,
                      marginBottom: 8,
                    }}
                    onClick={() => toggleAmendmentSelection(index)}
                  >
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        {renderAmendmentIcon(amendment.type)}
                        {renderAmendmentDescription(amendment, amendmentResult.amendments)}
                      </Space>
                      <Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {Math.round(getAmendmentConfidence(amendment) * 100)}%
                        </Text>
                        {selectedAmendments.has(index) ? (
                          <IconCheck style={{ color: 'rgb(var(--success-6))' }} />
                        ) : (
                          <IconClose style={{ color: 'rgb(var(--gray-4))' }} />
                        )}
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />

              {amendmentResult.warnings && amendmentResult.warnings.length > 0 && (
                <Alert type="warning" content={amendmentResult.warnings.join('. ')} />
              )}

              {amendmentResult.needsClarification && amendmentResult.needsClarification.length > 0 && (
                <Alert type="info" content={amendmentResult.needsClarification.join('. ')} />
              )}

              {/* Edit Mode Toggle */}
              <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
                <Button
                  type={showEditMode ? 'primary' : 'default'}
                  icon={<IconEdit />}
                  onClick={() => setShowEditMode(!showEditMode)}
                >
                  {showEditMode ? 'Hide Edit Options' : 'Edit Amendments'}
                </Button>
              </Space>

              {/* Edit Mode - Show editable fields for selected amendments */}
              {showEditMode && selectedAmendments.size > 0 && (
                <Space direction="vertical" style={{ width: '100%' }} size="medium">
                  {Array.from(selectedAmendments).map(index => {
                    const amendment = amendmentResult.amendments[index]
                    const edited = editedAmendments.get(index) || {}

                    return (
                      <Card key={index} style={{ backgroundColor: 'rgb(var(--gray-1))' }}>
                        <Space direction="vertical" style={{ width: '100%' }} size="small">
                          <Text bold>{getAmendmentTitle(amendment)}</Text>

                          {/* Duration editing for time logs and duration changes */}
                          {isAmendmentType(amendment, AmendmentType.TimeLog,
                            AmendmentType.DurationChange,
                            AmendmentType.TaskCreation) && (
                            <Space>
                              <Text>Duration (minutes):</Text>
                              <InputNumber
                                value={edited.duration || (amendment as any).duration || (amendment as any).newDuration || 60}
                                min={5}
                                max={480}
                                step={15}
                                onChange={(value) => {
                                  const newEdited = new Map(editedAmendments)
                                  newEdited.set(index, { ...edited, duration: value })
                                  setEditedAmendments(newEdited)
                                }}
                                style={{ width: 100 }}
                              />
                            </Space>
                          )}

                          {/* Priority editing for task creation */}
                          {isAmendmentType(amendment, AmendmentType.TaskCreation) && (
                            <>
                              <Space style={{ width: '100%' }}>
                                <Text>Importance:</Text>
                                <Slider
                                  value={edited.importance || (amendment as TaskCreation).importance || 5}
                                  min={1}
                                  max={10}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, importance: value as number })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ flex: 1 }}
                                />
                                <InputNumber
                                  value={edited.importance || (amendment as TaskCreation).importance || 5}
                                  min={1}
                                  max={10}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, importance: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 60 }}
                                />
                              </Space>
                              <Space style={{ width: '100%' }}>
                                <Text>Urgency:</Text>
                                <Slider
                                  value={edited.urgency || (amendment as TaskCreation).urgency || 5}
                                  min={1}
                                  max={10}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, urgency: value as number })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ flex: 1 }}
                                />
                                <InputNumber
                                  value={edited.urgency || (amendment as TaskCreation).urgency || 5}
                                  min={1}
                                  max={10}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, urgency: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 60 }}
                                />
                              </Space>
                              <Space>
                                <Text>Type:</Text>
                                <Select
                                  value={edited.taskType || (amendment as TaskCreation).taskType || TaskType.Focused}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, taskType: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 120 }}
                                >
                                  <Select.Option value={TaskType.Focused}>Focused</Select.Option>
                                  <Select.Option value={TaskType.Admin}>Admin</Select.Option>
                                  <Select.Option value={TaskType.Personal}>Personal</Select.Option>
                                </Select>
                              </Space>
                            </>
                          )}

                          {/* Step Addition editing */}
                          {isAmendmentType(amendment, AmendmentType.StepAddition) && (
                            <>
                              <Space>
                                <Text>Step Name:</Text>
                                <Input
                                  value={edited.stepName || (amendment as StepAddition).stepName || ''}
                                  placeholder="Enter step name"
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, stepName: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 200 }}
                                />
                              </Space>
                              <Space>
                                <Text>Duration (minutes):</Text>
                                <InputNumber
                                  value={edited.duration || (amendment as StepAddition).duration || 30}
                                  min={5}
                                  max={480}
                                  step={15}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, duration: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 100 }}
                                />
                              </Space>
                              <Space>
                                <Text>Type:</Text>
                                <Select
                                  value={edited.stepType || (amendment as StepAddition).stepType || TaskType.Focused}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, stepType: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 120 }}
                                >
                                  <Select.Option value={TaskType.Focused}>Focused</Select.Option>
                                  <Select.Option value={TaskType.Admin}>Admin</Select.Option>
                                </Select>
                              </Space>
                              <Space direction="vertical" style={{ width: '100%' }}>
                                <Text>Dependencies (select steps that must complete first):</Text>
                                <Select
                                  mode="multiple"
                                  value={edited.dependencies || (amendment as StepAddition).dependencies || []}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, dependencies: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  placeholder="Select prerequisite steps"
                                  style={{ width: '100%' }}
                                >
                                  {(() => {
                                    // Find the workflow this step is being added to
                                    const stepAddition = amendment as StepAddition
                                    const targetWorkflow = sequencedTasks.find(w =>
                                      w.id === stepAddition.workflowTarget?.id ||
                                      w.name === stepAddition.workflowTarget?.name,
                                    )

                                    // Get existing steps from the workflow
                                    const existingSteps = targetWorkflow?.steps || []

                                    // Also include any other steps being added in this amendment batch
                                    const otherNewSteps = amendmentResult?.amendments
                                      .filter((a, i) => i !== index && a.type === AmendmentType.StepAddition)
                                      .map(a => (a as StepAddition).stepName) || []
                                    return [...existingSteps.map(s => s.name), ...otherNewSteps].map(stepName => (
                                      <Select.Option key={stepName} value={stepName}>
                                        {stepName}
                                      </Select.Option>
                                    ))
                                  })()}
                                </Select>
                              </Space>
                            </>
                          )}

                          {/* Status Update editing */}
                          {isAmendmentType(amendment, AmendmentType.StatusUpdate) && (
                            <Space>
                              <Text>New Status:</Text>
                              <Select
                                value={edited.newStatus || (amendment as StatusUpdate).newStatus || 'in_progress'}
                                placeholder="Select status"
                                onChange={(value) => {
                                  const newEdited = new Map(editedAmendments)
                                  newEdited.set(index, { ...edited, newStatus: value })
                                  setEditedAmendments(newEdited)
                                }}
                                style={{ width: 150 }}
                              >
                                <Select.Option value="not_started">Not Started</Select.Option>
                                <Select.Option value="in_progress">In Progress</Select.Option>
                                <Select.Option value="blocked">Blocked</Select.Option>
                                <Select.Option value="completed">Completed</Select.Option>
                              </Select>
                            </Space>
                          )}

                          {/* Note editing */}
                          {isAmendmentType(amendment, AmendmentType.NoteAddition,
                            AmendmentType.TaskCreation) && (
                            <Space direction="vertical" style={{ width: '100%' }}>
                              <Text>{isAmendmentType(amendment, AmendmentType.NoteAddition) ? 'Note:' : 'Description:'}</Text>
                              <Input.TextArea
                                value={edited.note || edited.description ||
                                       (amendment as any).note || (amendment as any).description || ''}
                                onChange={(value) => {
                                  const newEdited = new Map(editedAmendments)
                                  const field = isAmendmentType(amendment, AmendmentType.NoteAddition) ? 'note' : 'description'
                                  newEdited.set(index, { ...edited, [field]: value })
                                  setEditedAmendments(newEdited)
                                }}
                                autoSize={{ minRows: 2, maxRows: 4 }}
                                style={{ width: '100%' }}
                              />
                            </Space>
                          )}

                          {/* Deadline editing */}
                          {isAmendmentType(amendment, AmendmentType.DeadlineChange) && (
                            <>
                              <Space>
                                <Text>Deadline Date:</Text>
                                <DatePicker
                                  showTime
                                  format="YYYY-MM-DD HH:mm"
                                  value={edited.newDeadline ? new Date(edited.newDeadline) : new Date((amendment as DeadlineChange).newDeadline)}
                                  onChange={(dateString, date) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, newDeadline: date })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 200 }}
                                />
                              </Space>
                              <Space>
                                <Text>Deadline Type:</Text>
                                <Select
                                  value={edited.deadlineType || (amendment as DeadlineChange).deadlineType || 'soft'}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, deadlineType: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 100 }}
                                >
                                  <Select.Option value="soft">Soft</Select.Option>
                                  <Select.Option value="hard">Hard</Select.Option>
                                </Select>
                              </Space>
                            </>
                          )}

                          {/* Priority Change Edit UI */}
                          {isAmendmentType(amendment, AmendmentType.PriorityChange) && (
                            <>
                              <Space>
                                <Text>Importance:</Text>
                                <Slider
                                  value={edited.importance || (amendment as PriorityChange).importance || 5}
                                  min={1}
                                  max={10}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, importance: value as number })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 150 }}
                                />
                                <InputNumber
                                  value={edited.importance || (amendment as PriorityChange).importance || 5}
                                  min={1}
                                  max={10}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, importance: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 60 }}
                                />
                              </Space>
                              <Space>
                                <Text>Urgency:</Text>
                                <Slider
                                  value={edited.urgency || (amendment as PriorityChange).urgency || 5}
                                  min={1}
                                  max={10}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, urgency: value as number })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 150 }}
                                />
                                <InputNumber
                                  value={edited.urgency || (amendment as PriorityChange).urgency || 5}
                                  min={1}
                                  max={10}
                                  onChange={(value) => {
                                    const newEdited = new Map(editedAmendments)
                                    newEdited.set(index, { ...edited, urgency: value })
                                    setEditedAmendments(newEdited)
                                  }}
                                  style={{ width: 60 }}
                                />
                              </Space>
                              {(amendment as PriorityChange).cognitiveComplexity !== undefined && (
                                <Space>
                                  <Text>Cognitive Complexity:</Text>
                                  <Slider
                                    value={edited.cognitiveComplexity || (amendment as PriorityChange).cognitiveComplexity || 3}
                                    min={1}
                                    max={5}
                                    onChange={(value) => {
                                      const newEdited = new Map(editedAmendments)
                                      newEdited.set(index, { ...edited, cognitiveComplexity: value as number })
                                      setEditedAmendments(newEdited)
                                    }}
                                    style={{ width: 150 }}
                                  />
                                  <InputNumber
                                    value={edited.cognitiveComplexity || (amendment as PriorityChange).cognitiveComplexity || 3}
                                    min={1}
                                    max={5}
                                    onChange={(value) => {
                                      const newEdited = new Map(editedAmendments)
                                      newEdited.set(index, { ...edited, cognitiveComplexity: value })
                                      setEditedAmendments(newEdited)
                                    }}
                                    style={{ width: 60 }}
                                  />
                                </Space>
                              )}
                            </>
                          )}

                          {/* Type Change Edit UI */}
                          {isAmendmentType(amendment, AmendmentType.TypeChange) && (
                            <Space>
                              <Text>New Type:</Text>
                              <Select
                                value={edited.newType || (amendment as TypeChange).newType}
                                onChange={(value) => {
                                  const newEdited = new Map(editedAmendments)
                                  newEdited.set(index, { ...edited, newType: value })
                                  setEditedAmendments(newEdited)
                                }}
                                style={{ width: 150 }}
                              >
                                <Select.Option value={TaskType.Focused}>Focused</Select.Option>
                                <Select.Option value={TaskType.Admin}>Admin</Select.Option>
                                <Select.Option value={TaskType.Personal}>Personal</Select.Option>
                              </Select>
                            </Space>
                          )}

                          {/* Dependency Change Edit UI - Using Unified Component */}
                          {isAmendmentType(amendment, AmendmentType.DependencyChange) && (() => {
                            const depChange = amendment as DependencyChange

                            // Get the workflow that contains this step
                            // The target points to the workflow that contains the step
                            const targetWorkflow = sequencedTasks.find(w =>
                              w.id === depChange.target.id ||
                              w.name === depChange.target.name,
                            )

                            // Get available steps from the workflow
                            const availableSteps = targetWorkflow?.steps?.map(s => ({
                              id: s.id,
                              name: s.name,
                              stepIndex: s.stepIndex,
                            })) || []

                            // Create the current amendment state (with edits if any)
                            const currentAmendment: DependencyChange = {
                              ...depChange,
                              ...edited,
                            }

                            return (
                              <DependencyEditor
                                mode="amendment"
                                amendment={currentAmendment}
                                onChange={(updated) => {
                                  const newEdited = new Map(editedAmendments)
                                  // Only store the changes, not the full amendment
                                  newEdited.set(index, {
                                    addDependencies: updated.addDependencies,
                                    removeDependencies: updated.removeDependencies,
                                    addDependents: updated.addDependents,
                                    removeDependents: updated.removeDependents,
                                  })
                                  setEditedAmendments(newEdited)
                                }}
                                availableSteps={availableSteps}
                                disabled={false}
                              />
                            )
                          })()}
                        </Space>
                      </Card>
                    )
                  })}
                </Space>
              )}
            </Space>
          </Card>
        )}

        {/* No amendments detected */}
        {amendmentResult && amendmentResult.amendments.length === 0 && (
          <Alert
            type="warning"
            content="No changes could be detected. Please try recording again with clearer instructions."
          />
        )}

        {/* Error Display */}
        {error && (
          <Alert type="error" content={error} closable onClose={() => setError(null)} />
        )}

        {/* Action Buttons */}
        {amendmentResult && amendmentResult.amendments.length > 0 && (
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Button
              onClick={() => {
                setRecordingState('idle')
                setTranscription('')
                setAmendmentResult(null)
                setError(null)
              }}
            >
              Try Again
            </Button>
            <Space>
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                type="primary"
                disabled={selectedAmendments.size === 0}
                onClick={applySelectedAmendments}
              >
                Apply {selectedAmendments.size} Change{selectedAmendments.size !== 1 ? 's' : ''}
              </Button>
            </Space>
          </Space>
        )}
      </Space>
    </Modal>
  )
}
