import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Modal, Button, Typography, Alert, Space, Card, Input, Tag, Divider, Upload } from '@arco-design/web-react'
import { IconSoundFill, IconPause, IconStop, IconRefresh, IconRobot, IconBulb, IconCheckCircle, IconUpload, IconFile } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'

const { TextArea } = Input
const { Title, Text } = Typography

interface BrainstormModalProps {
  visible: boolean
  onClose: () => void
  onTasksExtracted: (tasks: ExtractedTask[]) => void
  onWorkflowsExtracted?: (workflows: ExtractedWorkflow[], standaloneTasks: ExtractedTask[]) => void
}

interface ExtractedTask {
  name: string
  description: string
  estimatedDuration: number
  importance: number
  urgency: number
  type: 'focused' | 'admin'
  needsMoreInfo?: boolean
}

interface ExtractedWorkflow {
  name: string
  description: string
  importance: number
  urgency: number
  type: 'focused' | 'admin'
  steps: any[]
  totalDuration: number
  earliestCompletion: string
  worstCaseCompletion: string
  notes: string
}

interface BrainstormResult {
  summary: string
  tasks?: ExtractedTask[]
  workflows?: ExtractedWorkflow[]
  standaloneTasks?: ExtractedTask[]
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

export function BrainstormModal({ visible, onClose, onTasksExtracted, onWorkflowsExtracted }: BrainstormModalProps) {
  const [brainstormText, setBrainstormText] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [brainstormResult, setBrainstormResult] = useState<BrainstormResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [processingMode, setProcessingMode] = useState<'tasks' | 'workflows'>('workflows')
  const [jobContext, setJobContext] = useState('')
  const [showJobContextInput, setShowJobContextInput] = useState(false)
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null)
  const [isProcessingAudioFile, setIsProcessingAudioFile] = useState(false)
  const [contextAudioFile, setContextAudioFile] = useState<File | null>(null)
  const [isProcessingContextAudio, setIsProcessingContextAudio] = useState(false)
  const [jargonDictionary, setJargonDictionary] = useState<Record<string, string>>({})
  const [showJargonInput, setShowJargonInput] = useState(false)
  const [newJargonTerm, setNewJargonTerm] = useState('')
  const [newJargonDefinition, setNewJargonDefinition] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Define stopRecording before using it in useEffect
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState !== 'idle') {
      mediaRecorderRef.current.stop()
      setRecordingState('stopped')
    }
  }, [recordingState])

  // Load active job context and jargon dictionary when modal opens
  useEffect(() => {
    const loadJobContext = async () => {
      try {
        const activeContext = await getDatabase().getActiveJobContext()
        if (activeContext) {
          setJobContext(activeContext.context)
        }
      } catch (error) {
        console.error('Error loading job context:', error)
      }
    }

    const loadJargonDictionary = async () => {
      try {
        const dictionary = await getDatabase().getJargonDictionary()
        setJargonDictionary(dictionary)
      } catch (error) {
        console.error('Error loading jargon dictionary:', error)
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up recording if component unmounts
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop()
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
        } catch (error) {
          console.error('Error cleaning up recording:', error)
        }
      }
    }
  }, [])

  const startRecording = async () => {
    // Prevent multiple recordings
    if (recordingState === 'recording' || mediaRecorderRef.current?.state === 'recording') {
      console.log('Recording already in progress')
      return
    }

    try {
      console.log('Starting recording...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.log('Got media stream:', stream)

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

      console.log('Using MIME type:', mimeType)

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      console.log('Created MediaRecorder:', mediaRecorder)

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size)
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, chunks:', audioChunksRef.current.length)
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        await transcribeAudio(audioBlob, `recording.${mimeType.split('/')[1].split(';')[0]}`)

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        setError('Recording error occurred')
        setRecordingState('idle')
      }

      mediaRecorder.start(1000) // Collect data every second
      console.log('MediaRecorder started, state:', mediaRecorder.state)

      // Force state update to ensure UI updates
      setRecordingDuration(0)
      setError(null)
      setRecordingState('recording')

      // Log to verify state update was called
      console.log('Called setRecordingState with "recording"')
    } catch (error) {
      console.error('Error starting recording:', error)
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
      console.error('Error transcribing audio:', error)
      setError('Failed to transcribe audio. Please try again.')
    } finally {
      setIsTranscribing(false)
    }
  }

  const processUploadedAudio = async (file: File) => {
    setIsProcessingAudioFile(true)
    setError(null)
    try {
      // Clear existing text when processing a new file
      setBrainstormText('')

      const blob = new Blob([file], { type: file.type })
      await transcribeAudio(blob, file.name)

      setUploadedAudioFile(file)
    } catch (error) {
      console.error('Error processing uploaded audio:', error)
      setError('Failed to process uploaded audio file.')
    } finally {
      setIsProcessingAudioFile(false)
    }
  }

  const processContextAudio = async (file: File) => {
    setIsProcessingContextAudio(true)
    setError(null)
    try {
      const blob = new Blob([file], { type: file.type })
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const settings = await getDatabase().getBrainstormingSettings()
      const result = await getDatabase().transcribeAudioBuffer(
        uint8Array as any,
        file.name,
        settings,
      )

      // Append to job context
      setJobContext(prev => prev + (prev ? '\n\n' : '') + result.text)
      setContextAudioFile(file)

      // Auto-save the context
      await saveJobContext(jobContext + '\n\n' + result.text)
    } catch (error) {
      console.error('Error processing context audio:', error)
      setError('Failed to process context audio file.')
    } finally {
      setIsProcessingContextAudio(false)
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
      console.error('Error saving job context:', error)
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
      console.error('Error adding jargon entry:', error)
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

      if (processingMode === 'workflows') {
        const result = await getDatabase().extractWorkflowsFromBrainstorm(
          brainstormText.trim(),
          enrichedContext || undefined,
        )
        setBrainstormResult(result)
      } else {
        const result = await getDatabase().extractTasksFromBrainstorm(brainstormText.trim())
        setBrainstormResult({ summary: result.summary, tasks: result.tasks })
      }
    } catch (error) {
      console.error('Error processing brainstorm:', error)
      setError('Failed to process brainstorm with AI. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUseResults = () => {
    if (brainstormResult) {
      if (brainstormResult.workflows && brainstormResult.workflows.length > 0) {
        // Handle workflow-first results
        if (onWorkflowsExtracted) {
          onWorkflowsExtracted(
            brainstormResult.workflows,
            brainstormResult.standaloneTasks || [],
          )
        }
      } else if (brainstormResult.tasks && brainstormResult.tasks.length > 0) {
        // Handle task-only results
        onTasksExtracted(brainstormResult.tasks)
      }
      onClose()
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
      style={{ width: 800 }}
      autoFocus={false}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Processing Mode Selection */}
        <div>
          <Title heading={6}>AI Processing Mode</Title>
          <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
            Choose how you want the AI to interpret your brainstorm text:
          </Text>
          <Space>
            <Button
              type={processingMode === 'workflows' ? 'primary' : 'outline'}
              onClick={() => setProcessingMode('workflows')}
              icon={<IconBulb />}
            >
              Workflows (Recommended)
            </Button>
            <Button
              type={processingMode === 'tasks' ? 'primary' : 'outline'}
              onClick={() => setProcessingMode('tasks')}
            >
              Simple Tasks
            </Button>
          </Space>
          {processingMode === 'workflows' && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              AI will understand async dependencies, wait times, and create sequenced workflows.
            </Text>
          )}
        </div>

        {/* Job Context Section */}
        {processingMode === 'workflows' && (
          <div>
            <Space style={{ marginBottom: 12 }}>
              <Title heading={6}>Job Context</Title>
              <Button
                size="small"
                type="outline"
                onClick={() => setShowJobContextInput(!showJobContextInput)}
              >
                {showJobContextInput ? 'Hide' : 'Add Context'}
              </Button>
            </Space>
            {showJobContextInput && (
              <>
                <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                  Describe your role and typical async work patterns to help AI understand your workflow needs:
                </Text>
                <TextArea
                  value={jobContext}
                  onChange={setJobContext}
                  placeholder="e.g., I'm a software engineer working with CI/CD pipelines, code reviews typically take 4-24 hours, I work with external APIs that have processing delays..."
                  rows={3}
                  style={{ marginBottom: 8 }}
                  onBlur={() => saveJobContext()}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Context is automatically saved and persisted for future sessions
                </Text>

                <Divider style={{ margin: '12px 0' }} />

                {/* Voice Context Upload */}
                <div>
                  <Text strong style={{ fontSize: 14 }}>Or upload a voice memo about your job:</Text>
                  <Upload
                    accept="audio/*"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      processContextAudio(file)
                      return false
                    }}
                    disabled={isProcessingContextAudio}
                    style={{ marginTop: 8 }}
                  >
                    <Button
                      icon={<IconUpload />}
                      loading={isProcessingContextAudio}
                      size="small"
                    >
                      {isProcessingContextAudio ? 'Processing...' : 'Upload Voice Context'}
                    </Button>
                  </Upload>
                  {contextAudioFile && (
                    <Tag icon={<IconFile />} style={{ marginTop: 8 }}>
                      {contextAudioFile.name}
                    </Tag>
                  )}
                </div>

                <Divider style={{ margin: '12px 0' }} />

                {/* Jargon Dictionary */}
                <div>
                  <Space style={{ marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 14 }}>Industry Jargon Dictionary</Text>
                    <Tag size="small">{Object.keys(jargonDictionary).length} terms</Tag>
                    <Button
                      size="mini"
                      type="text"
                      onClick={() => setShowJargonInput(!showJargonInput)}
                    >
                      Add Term
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
                        <Button size="mini" type="primary" onClick={addJargonEntry}>
                          Add
                        </Button>
                        <Button size="mini" onClick={() => setShowJargonInput(false)}>
                          Cancel
                        </Button>
                      </Space>
                    </Space>
                  )}

                  {Object.keys(jargonDictionary).length > 0 && (
                    <div style={{ maxHeight: 100, overflowY: 'auto', marginTop: 8 }}>
                      {Object.entries(jargonDictionary).map(([term, definition]) => (
                        <Tag key={term} size="small" style={{ marginRight: 8, marginBottom: 4 }}>
                          {term}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Voice Recording Section */}
        <div>
          <Title heading={6}>Voice Input</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            {processingMode === 'workflows'
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

              {/* Debug info */}
              <Text type="secondary" style={{ fontSize: 12 }}>
                Debug: State={recordingState}, Duration={recordingDuration}s
              </Text>
            </Space>
          </div>
        </div>

        {/* Audio File Upload Section */}
        <div>
          <Title heading={6}>Or Upload Audio File</Title>
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
        </div>

        <Divider />

        {/* Text Input Section */}
        <div>
          <Title heading={6}>Brainstorm Text</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            {processingMode === 'workflows'
              ? 'Describe your async workflows - mention sequences, dependencies, wait times, and handoffs.'
              : 'Edit the transcribed text or type directly. Include details about deadlines, priorities, and requirements.'
            }
          </Text>

          <TextArea
            value={brainstormText}
            onChange={setBrainstormText}
            placeholder={processingMode === 'workflows'
              ? "Example: I need to run a workflow that will take a few hours to complete. After that I can check the results and submit for code review. Reviews usually take about a day, then I'll need to address feedback and re-submit..."
              : "Example: I need to finish the quarterly report by Friday, it's high priority. Also need to review the new marketing campaign designs and schedule team meetings for next week..."
            }
            rows={6}
            style={{ marginTop: 12 }}
            disabled={isProcessing}
          />
        </div>

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
              : processingMode === 'workflows'
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
                <span>Claude Opus 4.1 Analysis Results</span>
              </Space>
            }
            style={{ marginTop: 16 }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="medium">
              <div>
                <Text strong>Summary:</Text>
                <Text style={{ display: 'block', marginTop: 8 }}>
                  {brainstormResult.summary}
                </Text>
              </div>

              {/* Workflows Section */}
              {brainstormResult.workflows && brainstormResult.workflows.length > 0 && (
                <div>
                  <Text strong>Async Workflows ({brainstormResult.workflows.length}):</Text>
                  <div style={{ marginTop: 12 }}>
                    {brainstormResult.workflows.map((workflow, index) => (
                      <Card
                        key={index}
                        size="small"
                        style={{ marginBottom: 16 }}
                        title={
                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: 500 }}>
                              {workflow.name}
                            </Text>
                            <Space>
                              <Tag color={workflow.type === 'focused' ? 'blue' : 'green'} size="small">
                                {workflow.type === 'focused' ? 'Focused' : 'Admin'}
                              </Tag>
                              <Tag color="purple" size="small">
                                {workflow.steps.length} steps
                              </Tag>
                            </Space>
                          </Space>
                        }
                      >
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 14 }}>
                            {workflow.description}
                          </Text>

                          <Space wrap>
                            <Tag size="small" color="blue">
                              Active Work: {workflow.totalDuration}min
                            </Tag>
                            <Tag size="small" color="green">
                              Earliest: {workflow.earliestCompletion}
                            </Tag>
                            <Tag size="small" color="orange">
                              Worst Case: {workflow.worstCaseCompletion}
                            </Tag>
                          </Space>

                          <div style={{ marginTop: 12 }}>
                            <Text strong style={{ fontSize: 13 }}>Workflow Steps:</Text>
                            <div style={{ marginTop: 8 }}>
                              {workflow.steps.map((step: any, stepIndex: number) => (
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
                                      <Tag size="mini" color={step.type === 'focused' ? 'blue' : 'green'}>
                                        {step.duration}min
                                      </Tag>
                                      {step.asyncWaitTime > 0 && (
                                        <Tag size="mini" color="red">
                                          +{step.asyncWaitTime}min wait
                                        </Tag>
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

                          {workflow.notes && (
                            <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f0f9ff', borderRadius: 4 }}>
                              <Text style={{ fontSize: 13 }}>
                                <strong>Notes:</strong> {workflow.notes}
                              </Text>
                            </div>
                          )}
                        </Space>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Standalone Tasks Section */}
              {brainstormResult.standaloneTasks && brainstormResult.standaloneTasks.length > 0 && (
                <div>
                  <Text strong>Standalone Tasks ({brainstormResult.standaloneTasks.length}):</Text>
                  <div style={{ marginTop: 12 }}>
                    {brainstormResult.standaloneTasks.map((task, index) => (
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

              {/* Legacy Tasks Section (for task-only mode) */}
              {brainstormResult.tasks && brainstormResult.tasks.length > 0 && (
                <div>
                  <Text strong>Extracted Tasks ({brainstormResult.tasks.length}):</Text>
                  <div style={{ marginTop: 12 }}>
                    {brainstormResult.tasks.map((task, index) => (
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
                <Space>
                  <Button onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="primary" onClick={handleUseResults}>
                    {brainstormResult.workflows && brainstormResult.workflows.length > 0
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
