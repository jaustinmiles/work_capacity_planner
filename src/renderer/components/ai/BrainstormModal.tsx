import React, { useState, useRef, useEffect } from 'react'
import { Modal, Button, Typography, Alert, Space, Card, Input, Spin, Tag, Divider } from '@arco-design/web-react'
import { IconSoundFill, IconPause, IconStop, IconRefresh, IconRobot, IconBulb, IconCheckCircle } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'

const { TextArea } = Input
const { Title, Text } = Typography

interface BrainstormModalProps {
  visible: boolean
  onClose: () => void
  onTasksExtracted: (tasks: ExtractedTask[]) => void
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

interface BrainstormResult {
  summary: string
  tasks: ExtractedTask[]
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

export function BrainstormModal({ visible, onClose, onTasksExtracted }: BrainstormModalProps) {
  const [brainstormText, setBrainstormText] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [brainstormResult, setBrainstormResult] = useState<BrainstormResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setBrainstormText('')
      setBrainstormResult(null)
      setError(null)
      setRecordingState('idle')
      setRecordingDuration(0)
    } else {
      stopRecording()
    }
  }, [visible])

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeAudio(audioBlob)
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start(1000) // Collect data every second
      setRecordingState('recording')
      setRecordingDuration(0)
      setError(null)
    } catch (error) {
      console.error('Error starting recording:', error)
      setError('Failed to access microphone. Please check your permissions.')
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

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState !== 'idle') {
      mediaRecorderRef.current.stop()
      setRecordingState('stopped')
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true)
    try {
      const arrayBuffer = await audioBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      const settings = await getDatabase().getBrainstormingSettings()
      const result = await getDatabase().transcribeAudioBuffer(
        uint8Array as any, // Cast to Buffer-like for IPC
        'brainstorm.webm',
        settings
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

  const processWithAI = async () => {
    if (!brainstormText.trim()) {
      setError('Please provide some brainstorm text to process.')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      const result = await getDatabase().extractTasksFromBrainstorm(brainstormText.trim())
      setBrainstormResult(result)
    } catch (error) {
      console.error('Error processing brainstorm:', error)
      setError('Failed to process brainstorm with AI. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUseResults = () => {
    if (brainstormResult) {
      onTasksExtracted(brainstormResult.tasks)
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
        {/* Voice Recording Section */}
        <div>
          <Title heading={6}>Voice Input</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            Record your thoughts about upcoming tasks, projects, or ideas. Speak naturally about what you need to accomplish.
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

        <Divider />

        {/* Text Input Section */}
        <div>
          <Title heading={6}>Brainstorm Text</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            Edit the transcribed text or type directly. Include details about deadlines, priorities, and requirements.
          </Text>
          
          <TextArea
            value={brainstormText}
            onChange={setBrainstormText}
            placeholder="Example: I need to finish the quarterly report by Friday, it's high priority. Also need to review the new marketing campaign designs and schedule team meetings for next week..."
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
            {isProcessing ? 'Processing with AI...' : 'Extract Tasks with AI'}
          </Button>
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
                <span>AI Analysis Results</span>
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

              <div style={{ textAlign: 'center', paddingTop: 16 }}>
                <Space>
                  <Button onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="primary" onClick={handleUseResults}>
                    Use These Tasks
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