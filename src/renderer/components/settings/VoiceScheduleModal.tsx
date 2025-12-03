import { useState, useRef, useCallback, useEffect } from 'react'
import { Modal, Button, Typography, Alert, Space, Card, Tag, Divider, Upload, Input } from '@arco-design/web-react'
import { IconSoundFill, IconPause, IconStop, IconRefresh, IconRobot, IconUpload, IconFile, IconCheckCircle } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { WorkBlock, WorkMeeting } from '@shared/work-blocks-types'
import { isSingleTypeBlock, isComboBlock, isSystemBlock } from '@shared/user-task-types'
import dayjs from 'dayjs'
import { logger } from '@/logger'


const { TextArea } = Input
const { Title, Text } = Typography

interface VoiceScheduleModalProps {
  visible: boolean
  onClose: () => void
  onScheduleExtracted: (__schedules: ExtractedSchedule[] | ExtractedSchedule) => void
  targetDate?: string
}

interface ExtractedSchedule {
  date: string
  blocks: WorkBlock[]
  meetings: WorkMeeting[]
  summary: string
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

export function VoiceScheduleModal({ visible, onClose, onScheduleExtracted, targetDate }: VoiceScheduleModalProps) {
  const [scheduleText, setScheduleText] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [scheduleResult, setScheduleResult] = useState<ExtractedSchedule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null)
  const [isProcessingAudioFile, setIsProcessingAudioFile] = useState(false)

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

  // Initialize when modal opens
  useEffect(() => {
    if (visible) {
      setScheduleText('')
      setScheduleResult(null)
      setError(null)
      setRecordingState('idle')
      setRecordingDuration(0)
    }
  }, [visible])

  // Cleanup when modal closes
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

  const startRecording = async () => {
    if (recordingState === 'recording' || mediaRecorderRef.current?.state === 'recording') {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

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
        await transcribeAudio(audioBlob, `schedule_recording.${mimeType.split('/')[1].split(';')[0]}`)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.onerror = (_event) => {
        logger.ui.error('MediaRecorder error:', _event)
        setError('Recording error occurred')
        setRecordingState('idle')
      }

      mediaRecorder.start(1000)
      setRecordingDuration(0)
      setError(null)
      setRecordingState('recording')
    } catch (error) {
      logger.ui.error('Error starting recording', {
        error: error instanceof Error ? error.message : String(error),
      }, 'voice-recording-start-error')
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

  const transcribeAudio = async (audioBlob: Blob, filename: string = 'schedule.webm') => {
    setIsTranscribing(true)
    try {
      const arrayBuffer = await audioBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const settings = await getDatabase().getSchedulingSettings()
      const result = await getDatabase().transcribeAudioBuffer(
        uint8Array as any,
        filename,
        settings,
      )

      setScheduleText(prev => prev + (prev ? ' ' : '') + result.text)
      setError(null)
    } catch (error) {
      logger.ui.error('Error transcribing audio', {
        error: error instanceof Error ? error.message : String(error),
      }, 'audio-transcribe-error')
      setError('Failed to transcribe audio. Please try again.')
    } finally {
      setIsTranscribing(false)
    }
  }

  const processUploadedAudio = async (file: File) => {
    setIsProcessingAudioFile(true)
    setError(null)
    try {
      setScheduleText('')
      const blob = new Blob([file], { type: file.type })
      await transcribeAudio(blob, file.name)
      setUploadedAudioFile(file)
    } catch (error) {
      logger.ui.error('Error processing uploaded audio', {
        error: error instanceof Error ? error.message : String(error),
        fileName: file.name,
      }, 'audio-upload-process-error')
      setError('Failed to process uploaded audio file.')
    } finally {
      setIsProcessingAudioFile(false)
    }
  }

  const processWithAI = async () => {
    if (!scheduleText.trim()) {
      setError('Please provide some schedule information to process.')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      // Use multi-day extraction to handle "weekdays", "weekends", etc.
      const results = await getDatabase().extractMultiDayScheduleFromVoice(
        scheduleText.trim(),
        targetDate || dayjs().format('YYYY-MM-DD'),
      )
      // TODO: Remove this conversion once AI service is updated to return new format
      // For now, convert from old format to new format
      const convertedResults = results.map((result: any) => ({
        ...result,
        blocks: result.blocks.map((block: any) => ({
          ...block,
          // Convert old 'type' string to new typeConfig format
          typeConfig: block.typeConfig || (
            block.type === 'mixed' ? {
              kind: 'combo' as const,
              allocations: [
                { typeId: 'focused', ratio: 0.5 },
                { typeId: 'admin', ratio: 0.5 },
              ],
            } : {
              kind: 'single' as const,
              typeId: block.type || 'focused',
            }
          ),
          capacity: block.capacity ? {
            totalMinutes: (block.capacity.focusMinutes || 0) + (block.capacity.admin || 0) + (block.capacity.personalMinutes || 0),
          } : undefined,
        })),
      }))
      setScheduleResult(convertedResults)
    } catch (error) {
      logger.ui.error('Error processing schedule with AI', {
        error: error instanceof Error ? error.message : String(error),
        scheduleTextLength: scheduleText.length,
      }, 'ai-schedule-process-error')
      setError('Failed to process schedule with AI. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUseResults = () => {
    if (scheduleResult && scheduleResult.length > 0) {
      // Pass all schedules to parent - it now handles both single and multi-day
      onScheduleExtracted(scheduleResult)
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
          <IconSoundFill />
          <span>Voice Schedule Planning</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: 800 }}
      autoFocus={false}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Instructions */}
        <Alert
          type="info"
          content={
            <div>
              <Text style={{ fontWeight: 'bold' }}>How to describe your schedule:</Text>
              <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                <li>Mention your available time blocks (e.g., {'"'}I{'\''}m available from 9am to 5pm{'"'})</li>
                <li>Specify focus vs admin time needs (e.g., {'"'}I need 4 hours of focus time and 2 hours for admin{'"'})</li>
                <li>Include any meetings or breaks (e.g., {'"'}I have a standup at 10am for 30 minutes{'"'})</li>
                <li>You can describe multiple days (e.g., {'"'}Tomorrow I have..., On Friday...{'"'})</li>
              </ul>
            </div>
          }
        />

        {/* Voice Recording Section */}
        <div>
          <Title heading={6}>Voice Input</Title>
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
          <Upload
            accept="audio/*"
            showUploadList={false}
            beforeUpload={(file) => {
              processUploadedAudio(file)
              return false
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
            </Space>
          )}
        </div>

        <Divider />

        {/* Text Input Section */}
        <div>
          <Title heading={6}>Schedule Description</Title>
          <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
            Type or dictate your schedule requirements below
          </Text>
          <TextArea
            value={scheduleText}
            onChange={setScheduleText}
            placeholder="Example: Today I have 8 hours available from 9am to 5pm. I need to focus for at least 4 hours on coding and have 2 hours for emails and admin tasks. I have a team standup at 10am for 30 minutes and lunch from 12 to 1pm..."
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
            disabled={!scheduleText.trim() || isTranscribing}
            size="large"
          >
            {isProcessing ? 'Processing with AI...' : 'Generate Schedule'}
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
        {scheduleResult && scheduleResult.length > 0 && (
          <Card
            title={
              <Space>
                <IconCheckCircle style={{ color: '#00b42a' }} />
                <span>Extracted Schedule ({scheduleResult.length} days)</span>
              </Space>
            }
            style={{ marginTop: 16 }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="medium">
              {/* Display each day's schedule */}
              {scheduleResult.map((daySchedule, dayIndex) => (
                <Card key={dayIndex} size="small" title={dayjs(daySchedule.date).format('dddd, MMMM D, YYYY')}>
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <div>
                      <Text style={{ fontWeight: 'bold' }}>Summary:</Text>
                      <Text style={{ display: 'block', marginTop: 4 }}>
                        {daySchedule.summary}
                      </Text>
                    </div>

                    {/* Work Blocks */}
                    {daySchedule.blocks.length > 0 && (
                      <div>
                        <Text style={{ fontWeight: 'bold' }}>Work Blocks ({daySchedule.blocks.length}):</Text>
                        <div style={{ marginTop: 8 }}>
                          {daySchedule.blocks.map((block, index) => (
                            <div key={index} style={{ marginBottom: 4 }}>
                              <Space>
                                <Text>{block.startTime} - {block.endTime}</Text>
                                <Tag color={
                                  isSystemBlock(block.typeConfig) ? 'gray' :
                                  isComboBlock(block.typeConfig) ? 'purple' :
                                  isSingleTypeBlock(block.typeConfig) ? (
                                    block.typeConfig.typeId === 'focused' ? 'blue' :
                                    block.typeConfig.typeId === 'admin' ? 'green' :
                                    block.typeConfig.typeId === 'personal' ? 'orange' : 'blue'
                                  ) : 'gray'
                                }>
                                  {isSystemBlock(block.typeConfig) ? block.typeConfig.systemType :
                                   isComboBlock(block.typeConfig) ? 'Combo' :
                                   isSingleTypeBlock(block.typeConfig) ? block.typeConfig.typeId : 'unknown'}
                                </Tag>
                                {isComboBlock(block.typeConfig) && (
                                  <Text type="secondary">
                                    {block.typeConfig.allocations.map(a => `${Math.round(a.ratio * 100)}% ${a.typeId}`).join(' / ')}
                                  </Text>
                                )}
                                {block.capacity && (
                                  <Text type="secondary">
                                    {block.capacity.totalMinutes}min
                                  </Text>
                                )}
                              </Space>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meetings */}
                    {daySchedule.meetings.length > 0 && (
                      <div>
                        <Text style={{ fontWeight: 'bold' }}>Meetings ({daySchedule.meetings.length}):</Text>
                        <div style={{ marginTop: 8 }}>
                          {daySchedule.meetings.map((meeting, index) => (
                            <div key={index} style={{ marginBottom: 4 }}>
                              <Space>
                                <Text style={{ fontWeight: 500 }}>{meeting.name}</Text>
                                <Text>{meeting.startTime} - {meeting.endTime}</Text>
                                <Tag color={
                                  meeting.type === 'meeting' ? 'blue' :
                                  meeting.type === 'break' ? 'green' : 'orange'
                                }>
                                  {meeting.type}
                                </Tag>
                              </Space>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Space>
                </Card>
              ))}

              <div style={{ textAlign: 'center', paddingTop: 16 }}>
                <Space>
                  <Button onClick={onClose}>Cancel</Button>
                  <Button type="primary" onClick={handleUseResults}>
                    Use This Schedule
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
