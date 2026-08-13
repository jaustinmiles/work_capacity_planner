/**
 * JournalEntryEditor — edits one journal entry (title + rich-text body) and the
 * actions on it: Save, "Process into mind map" (the AI sync), and Delete.
 *
 * Holds a local draft seeded from the entry; the RichTextEditor is keyed by entry
 * id so switching entries reinitializes cleanly. "Process" saves the latest text
 * first (so the server extracts from current content) then runs the sync.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Input, Space, Typography, Message, Popconfirm, Tag } from '@arco-design/web-react'
import { IconDelete, IconMindMapping, IconCheckCircle, IconVoice, IconPause } from '@arco-design/web-react/icon'
import { JournalViewMode } from '@shared/enums'
import { useJournalStore, type JournalEntryRow } from '../../store/useJournalStore'
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor'
import { useVoiceRecording } from '../../hooks/useVoiceRecording'
import { logger } from '@/logger'

interface JournalEntryEditorProps {
  entry: JournalEntryRow
}

export function JournalEntryEditor({ entry }: JournalEntryEditorProps) {
  const updateEntry = useJournalStore((s) => s.updateEntry)
  const deleteEntry = useJournalStore((s) => s.deleteEntry)
  const processEntry = useJournalStore((s) => s.processEntry)
  const setViewMode = useJournalStore((s) => s.setViewMode)
  const processing = useJournalStore((s) => s.processing)

  const [title, setTitle] = useState(entry.title)
  // Body draft lives in a ref — the contenteditable is the source of truth and we
  // don't want to re-render it on every keystroke.
  const draftRef = useRef<{ html: string; plainText: string }>({
    html: entry.content,
    plainText: entry.plainText,
  })
  const [dirty, setDirty] = useState(false)
  const editorHandleRef = useRef<RichTextEditorHandle>(null)

  // Voice dictation — reuses the app's ONE recording/transcription pipeline
  // (useVoiceRecording → speech.transcribeBuffer → Whisper), same as ChatView.
  const {
    recordingState,
    isTranscribing,
    recordingDuration,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    transcriptionPrompt:
      'Personal journal entry: reflections, feelings, daily events, plans, and ideas.',
    onTranscriptionComplete: (text) => {
      const transcript = text.trim()
      if (transcript.length === 0) {
        Message.info('No speech detected in the recording.')
        return
      }
      // Insert at the caret; handleBodyChange fires via the editor's onChange
      // and marks the draft dirty.
      editorHandleRef.current?.insertText(transcript)
    },
    onError: (message) => {
      logger.ui.error('Journal dictation failed', { error: message, entryId: entry.id }, 'journal-voice-error')
      Message.error(`Dictation failed: ${message}`)
    },
  })
  const isRecording = recordingState === 'recording'

  const toggleDictation = (): void => {
    if (isRecording) {
      stopRecording()
    } else if (!isTranscribing) {
      void startRecording()
    }
  }

  // Reseed when the selected entry changes.
  useEffect(() => {
    setTitle(entry.title)
    draftRef.current = { html: entry.content, plainText: entry.plainText }
    setDirty(false)
  }, [entry.id, entry.title, entry.content, entry.plainText])

  const handleBodyChange = (html: string, plainText: string): void => {
    draftRef.current = { html, plainText }
    setDirty(true)
  }

  const handleTitleChange = (value: string): void => {
    setTitle(value)
    setDirty(true)
  }

  const persist = async (): Promise<void> => {
    await updateEntry(entry.id, {
      title,
      content: draftRef.current.html,
      plainText: draftRef.current.plainText,
    })
    setDirty(false)
  }

  const handleSave = async (): Promise<void> => {
    try {
      await persist()
      Message.success('Saved')
    } catch (error) {
      logger.ui.error('Failed to save journal entry', {
        error: error instanceof Error ? error.message : String(error),
        entryId: entry.id,
      }, 'journal-save-error')
      Message.error('Failed to save')
    }
  }

  const handleProcess = async (): Promise<void> => {
    if (draftRef.current.plainText.trim().length === 0) {
      Message.warning('Write something first — there is nothing to process yet.')
      return
    }
    try {
      await persist()
      const result = await processEntry(entry.id)
      const parts = [`${result.created.nodes} concepts`, `${result.created.edges} links`]
      const rejected = result.rejected.nodes + result.rejected.edges
      Message.success(
        `Synced into the mind map: ${parts.join(', ')}` +
          (rejected > 0 ? ` (${rejected} invalid suggestion${rejected === 1 ? '' : 's'} discarded)` : ''),
      )
      setViewMode(JournalViewMode.Scene)
    } catch (error) {
      logger.ui.error('Failed to process journal entry', {
        error: error instanceof Error ? error.message : String(error),
        entryId: entry.id,
      }, 'journal-process-error')
      Message.error('Processing failed. Please try again.')
    }
  }

  const handleDelete = async (): Promise<void> => {
    try {
      await deleteEntry(entry.id)
      Message.success('Entry deleted')
    } catch (error) {
      logger.ui.error('Failed to delete journal entry', {
        error: error instanceof Error ? error.message : String(error),
        entryId: entry.id,
      }, 'journal-delete-error')
      Message.error('Failed to delete')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 10 }}>
      <Input
        value={title}
        onChange={handleTitleChange}
        placeholder="Entry title"
        style={{ fontSize: 18, fontWeight: 600 }}
        size="large"
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        <RichTextEditor
          key={entry.id}
          ref={editorHandleRef}
          defaultValue={entry.content}
          onChange={handleBodyChange}
          placeholder="What's on your mind? Write freely — you can process this into your mind map when you're done."
          toolbarExtra={
            <>
              {isRecording && (
                <Typography.Text type="error" style={{ fontSize: 12 }}>
                  Recording: {recordingDuration}s
                </Typography.Text>
              )}
              {isTranscribing && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Transcribing…
                </Typography.Text>
              )}
              <Button
                size="mini"
                type="text"
                status={isRecording ? 'danger' : undefined}
                loading={isTranscribing}
                icon={isRecording ? <IconPause /> : <IconVoice />}
                title={isRecording ? 'Stop dictation and transcribe' : 'Dictate into this entry'}
                // Keep the editor's caret so the transcript lands where the user left it.
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggleDictation}
              />
            </>
          }
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          {entry.processedAt !== null ? (
            <Tag color="arcoblue" icon={<IconCheckCircle />}>
              Synced to mind map
            </Tag>
          ) : (
            <Typography.Text type="secondary">Not yet processed</Typography.Text>
          )}
          {dirty && <Typography.Text type="warning">Unsaved changes</Typography.Text>}
        </Space>
        <Space>
          <Popconfirm title="Delete this entry?" onOk={handleDelete} okButtonProps={{ status: 'danger' }}>
            <Button type="text" status="danger" icon={<IconDelete />}>
              Delete
            </Button>
          </Popconfirm>
          <Button onClick={handleSave} disabled={!dirty}>
            Save
          </Button>
          <Button
            type="primary"
            icon={<IconMindMapping />}
            loading={processing}
            onClick={handleProcess}
          >
            Process into mind map
          </Button>
        </Space>
      </div>
    </div>
  )
}
