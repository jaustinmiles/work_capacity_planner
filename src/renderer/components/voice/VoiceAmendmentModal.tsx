import { useState, useRef, useEffect } from 'react'
import { Modal, Button, Typography, Alert, Space, Card, Tag, Spin, List, Badge, Input, Upload, Slider, InputNumber, Select } from '@arco-design/web-react'
import { IconSoundFill, IconStop, IconRefresh, IconCheck, IconClose, IconEdit, IconClockCircle, IconFile, IconSchedule, IconMessage, IconPlus, IconLink, IconUpload, IconInfoCircle } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
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
  TaskCreation,
  DependencyChange,
  TaskType,
} from '../../../shared/amendment-types'
import { useTaskStore } from '../../store/useTaskStore'
import { logger } from '../../utils/logger'


const { Title, Text, Paragraph } = Typography

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
      logger.ui.error('Error starting recording:', err)
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
      logger.ui.error('Error processing audio:', err)
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
      logger.ui.error('Error parsing transcription:', err)
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
    ).map((amendment, originalIndex) => {
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
      return edited
    })

    try {
      // TODO: Actually apply the amendments to tasks/workflows
      // For now, just notify parent
      onAmendmentsApplied?.(amendmentsToApply)
      Message.success(`Applied ${amendmentsToApply.length} amendment(s)`)
      handleClose()
    } catch (err) {
      setError('Failed to apply amendments')
      logger.ui.error('Error applying amendments:', err)
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
      logger.ui.error('Error processing uploaded audio file:', err)
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
    // logger.ui.debug('[VoiceAmendmentModal] renderAmendmentIcon - type:', type, 'typeof:', typeof type)
    // Handle both string literals and enum values since IPC serialization converts enums to strings
    switch (type) {
      case 'status_update':
      case AmendmentType.StatusUpdate:
        return <IconCheck />
      case 'time_log':
      case AmendmentType.TimeLog:
        return <IconClockCircle />
      case 'note_addition':
      case AmendmentType.NoteAddition:
        return <IconFile />
      case 'duration_change':
      case AmendmentType.DurationChange:
        return <IconSchedule />
      case 'step_addition':
      case AmendmentType.StepAddition:
        return <IconEdit />
      case 'task_creation':
      case AmendmentType.TaskCreation:
        return <IconPlus />
      case 'dependency_change':
      case AmendmentType.DependencyChange:
        return <IconLink />
      default:
        logger.ui.warn('[VoiceAmendmentModal] Unknown amendment type in icon:', type)
        return <IconEdit />
    }
  }

  const renderAmendmentDescription = (amendment: Amendment) => {
    // logger.ui.debug('[VoiceAmendmentModal] renderAmendmentDescription - type:', amendment.type, 'full amendment:', amendment)
    // Handle both string literals and enum values since IPC serialization converts enums to strings
    switch (amendment.type) {
      case 'status_update':
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
      case 'time_log':
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
      case 'note_addition':
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
      case 'duration_change':
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
      case 'step_addition':
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
      case 'task_creation':
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
      case 'dependency_change':
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
                <Text bold>{depChange.addDependencies.join(', ')}</Text>
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
      default:
        logger.ui.error(`[VoiceAmendmentModal] Unknown amendment type: ${amendment.type}`, undefined, { fullAmendment: amendment })
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

  const getAmendmentTitle = (amendment: Amendment) => {
    switch (amendment.type) {
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
                        {renderAmendmentDescription(amendment)}
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
                          {(amendment.type === AmendmentType.TimeLog ||
                            amendment.type === AmendmentType.DurationChange ||
                            amendment.type === AmendmentType.TaskCreation) && (
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
                          {amendment.type === AmendmentType.TaskCreation && (
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

                          {/* Note editing */}
                          {(amendment.type === AmendmentType.NoteAddition ||
                            amendment.type === AmendmentType.TaskCreation) && (
                            <Space direction="vertical" style={{ width: '100%' }}>
                              <Text>{amendment.type === AmendmentType.NoteAddition ? 'Note:' : 'Description:'}</Text>
                              <Input.TextArea
                                value={edited.note || edited.description ||
                                       (amendment as any).note || (amendment as any).description || ''}
                                onChange={(value) => {
                                  const newEdited = new Map(editedAmendments)
                                  const field = amendment.type === AmendmentType.NoteAddition ? 'note' : 'description'
                                  newEdited.set(index, { ...edited, [field]: value })
                                  setEditedAmendments(newEdited)
                                }}
                                autoSize={{ minRows: 2, maxRows: 4 }}
                                style={{ width: '100%' }}
                              />
                            </Space>
                          )}
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
