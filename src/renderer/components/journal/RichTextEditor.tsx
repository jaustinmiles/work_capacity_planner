/**
 * RichTextEditor — a lightweight, zero-dependency contenteditable editor with a
 * simplified "Google-Docs" formatting toolbar (title / heading / body, bold,
 * italic, lists). Stores HTML; also emits a derived plain-text projection used for
 * AI processing + search.
 *
 * Semi-uncontrolled: the initial HTML is written imperatively on mount, and the
 * parent remounts the editor (via `key`) when switching entries, so typing never
 * fights a controlled value (no cursor jumps). See decision doc D6.
 */

import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import { Space, Button, Divider } from '@arco-design/web-react'

interface RichTextEditorProps {
  /** Initial HTML content (written once on mount). */
  defaultValue: string
  /** Called on every edit with the current HTML and derived plain text. */
  onChange: (html: string, plainText: string) => void
  /** Placeholder shown when empty. */
  placeholder?: string
  /** Extra controls rendered at the right end of the toolbar (e.g. dictation). */
  toolbarExtra?: ReactNode
}

export interface RichTextEditorHandle {
  /**
   * Insert plain text at the caret (or at the end of the document when the
   * selection is outside the editor), separating it from adjacent text with a
   * space when needed. Emits onChange.
   */
  insertText: (text: string) => void
}

interface ToolbarAction {
  label: ReactNode
  title: string
  run: () => void
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ defaultValue, onChange, placeholder, toolbarExtra }, ref) {
  const editorRef = useRef<HTMLDivElement>(null)

  // Initialize content once on mount (component is remounted per entry via `key`).
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = defaultValue
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emitChange = (): void => {
    const el = editorRef.current
    if (!el) return
    onChange(el.innerHTML, el.innerText)
  }

  // Range-API insertion (not execCommand): deterministic, works in jsdom, and
  // lets us restore the caret after the inserted text.
  useImperativeHandle(ref, () => ({
    insertText: (text: string): void => {
      const el = editorRef.current
      if (!el || text.length === 0) return

      // Capture the caret BEFORE focusing — focus() resets the selection to
      // the start of the editor when it was previously elsewhere.
      const selection = window.getSelection()
      let range: Range | null = null
      if (selection && selection.rangeCount > 0) {
        const candidate = selection.getRangeAt(0)
        if (el.contains(candidate.commonAncestorContainer)) {
          range = candidate
        }
      }
      el.focus()
      if (!range) {
        // Selection lives outside the editor (e.g. after clicking a button
        // elsewhere) — append at the end of the document.
        range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
      }
      range.deleteContents()

      // Separate dictated text from an adjacent word with a space. The caret
      // container is a text node when placed mid-text, or an element (with the
      // offset counting child nodes) when collapsed to the end of the document.
      const { startContainer, startOffset } = range
      let prevChar = ''
      if (startContainer.nodeType === Node.TEXT_NODE) {
        if (startOffset > 0) {
          prevChar = (startContainer.textContent ?? '').charAt(startOffset - 1)
        }
      } else if (startOffset > 0) {
        const childBefore = startContainer.childNodes[startOffset - 1]
        prevChar = (childBefore?.textContent ?? '').slice(-1)
      }
      const needsSpace = prevChar !== '' && !/\s/.test(prevChar)

      const node = document.createTextNode(needsSpace ? ` ${text}` : text)
      range.insertNode(node)
      range.setStartAfter(node)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)

      emitChange()
    },
  }))

  // execCommand is deprecated but fully functional in Electron/Chromium and is the
  // pragmatic zero-dependency path (decision doc D6). Toolbar buttons preventDefault
  // on mousedown so the editor keeps its selection when clicked.
  const exec = (command: string, value?: string): void => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    emitChange()
  }

  const actions: ToolbarAction[] = [
    { label: <strong style={{ fontSize: 16 }}>Title</strong>, title: 'Title (H1)', run: () => exec('formatBlock', 'H1') },
    { label: <strong style={{ fontSize: 14 }}>Heading</strong>, title: 'Heading (H2)', run: () => exec('formatBlock', 'H2') },
    { label: <span>Body</span>, title: 'Body text', run: () => exec('formatBlock', 'P') },
    { label: <strong>B</strong>, title: 'Bold', run: () => exec('bold') },
    { label: <em>I</em>, title: 'Italic', run: () => exec('italic') },
    { label: <span style={{ textDecoration: 'underline' }}>U</span>, title: 'Underline', run: () => exec('underline') },
    { label: <span>• List</span>, title: 'Bulleted list', run: () => exec('insertUnorderedList') },
    { label: <span>1. List</span>, title: 'Numbered list', run: () => exec('insertOrderedList') },
  ]

  return (
    <div
      style={{
        border: '1px solid var(--color-border-2)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '6px 8px',
          borderBottom: '1px solid var(--color-border-2)',
          background: 'var(--color-fill-1)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Space size={2} wrap>
          {actions.map((action, i) => (
            <Fragment key={action.title}>
              {/* Visual grouping: divider after the block-format buttons. */}
              {i === 3 && <Divider type="vertical" />}
              <Button
                size="mini"
                type="text"
                title={action.title}
                // Keep the editor's selection when the toolbar is clicked.
                onMouseDown={(e) => e.preventDefault()}
                onClick={action.run}
              >
                {action.label}
              </Button>
            </Fragment>
          ))}
        </Space>
        {toolbarExtra && <Space size={4}>{toolbarExtra}</Space>}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? 'Start writing…'}
        onInput={emitChange}
        className="journal-rich-text"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '14px 16px',
          outline: 'none',
          lineHeight: 1.6,
          fontSize: 15,
        }}
      />
    </div>
  )
})
