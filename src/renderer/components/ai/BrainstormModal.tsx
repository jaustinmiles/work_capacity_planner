import { useState, useRef, useEffect, useCallback } from 'react'
import { Modal, Button, Typography, Alert, Space, Card, Input, Tag, Divider, Upload } from '@arco-design/web-react'
import { IconSoundFill, IconPause, IconStop, IconRefresh, IconRobot, IconBulb, IconCheckCircle, IconUpload, IconFile } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'

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
  duration?: number
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
  const [contextRecordingState, setContextRecordingState] = useState<RecordingState>('idle')
  const [contextRecordingDuration, setContextRecordingDuration] = useState(0)

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

      mediaRecorder.onerror = (event) => {
        console.error('Context MediaRecorder error:', event)
        setError('Context recording error occurred')
        setContextRecordingState('idle')
      }

      mediaRecorder.start(100)
      setContextRecordingDuration(0)
      setError(null)
      setContextRecordingState('recording')
    } catch (error) {
      console.error('Error starting context recording:', error)
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
          console.error('Error cleaning up recording:', error)
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

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        setError('Recording error occurred')
        setRecordingState('idle')
      }

      mediaRecorder.start(1000) // Collect data every second

      // Force state update to ensure UI updates
      setRecordingDuration(0)
      setError(null)
      setRecordingState('recording')
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
      // Log audio blob details for debugging
      console.log('Transcribing audio:', {
        filename,
        size: audioBlob.size,
        type: audioBlob.type,
        sizeInMB: (audioBlob.size / (1024 * 1024)).toFixed(2) + 'MB'
      })
      
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
      console.log('Transcription successful, text length:', result.text.length)
    } catch (error) {
      console.error('Error transcribing audio:', error)
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
      console.error('Error processing uploaded audio:', error)
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
      console.error('Error processing context audio:', error)
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
      const prompt = `Based on this job context, identify technical terms, acronyms, and industry-specific jargon that might need definition. Return ONLY a JSON array of terms (no definitions needed, just the terms themselves).

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
              existing.toLowerCase() === term.toLowerCase()
            )
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
        console.error('Failed to parse jargon terms:', parseError)
      }
    } catch (error) {
      console.error('Error extracting jargon terms:', error)
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
          enrichedContext ?? null,
        )
        setBrainstormResult({
          workflows: result.workflows.map(wf => ({
            ...wf,
            duration: wf.totalDuration || 0,
            totalDuration: wf.totalDuration || 0,
          })),
          standaloneTasks: result.standaloneTasks,
          summary: result.summary,
        })
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

                {/* Voice Context Options */}
                <div>
                  <Text style={{ fontSize: 14, fontWeight: 'bold' }}>Or use voice input:</Text>
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
              </>
            )}
            
            {/* Jargon Dictionary - Always visible when in workflow mode */}
            {processingMode === 'workflows' && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <div>
                  <Space style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold' }}>Industry Jargon Dictionary</Text>
                    <Tag size="small">{Object.keys(jargonDictionary).length} terms</Tag>
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
                                  existing.toLowerCase() === term.toLowerCase()
                                )
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
                            console.error('Failed to extract jargon:', error)
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
                              onChange={async (value) => {
                                // Update local state immediately
                                const updated = { ...jargonDictionary, [term]: value }
                                setJargonDictionary(updated)
                                
                                // Save to database (debounced in practice)
                                try {
                                  await getDatabase().updateJargonDefinition(term, value)
                                } catch (error) {
                                  console.error('Error updating jargon definition:', error)
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
                <Text style={{ fontWeight: 'bold' }}>Summary:</Text>
                <Text style={{ display: 'block', marginTop: 8 }}>
                  {brainstormResult.summary}
                </Text>
              </div>

              {/* Workflows Section */}
              {brainstormResult.workflows && brainstormResult.workflows.length > 0 && (
                <div>
                  <Text style={{ fontWeight: 'bold' }}>Async Workflows ({brainstormResult.workflows.length}):</Text>
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
                              Active Work: {workflow.duration}min
                            </Tag>
                            <Tag size="small" color="green">
                              Earliest: {workflow.earliestCompletion}
                            </Tag>
                            <Tag size="small" color="orange">
                              Worst Case: {workflow.worstCaseCompletion}
                            </Tag>
                          </Space>

                          <div style={{ marginTop: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: 'bold' }}>Workflow Steps:</Text>
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
                                      <Tag size="small" color={step.type === 'focused' ? 'blue' : 'green'}>
                                        {step.duration}min
                                      </Tag>
                                      {step.asyncWaitTime > 0 && (
                                        <Tag size="small" color="red">
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
                                <span style={{ fontWeight: 'bold' }}>Notes:</span> {workflow.notes}
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
                  <Text style={{ fontWeight: 'bold' }}>Standalone Tasks ({brainstormResult.standaloneTasks.length}):</Text>
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
                  <Text style={{ fontWeight: 'bold' }}>Extracted Tasks ({brainstormResult.tasks.length}):</Text>
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
