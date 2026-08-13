import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { RichTextEditor, type RichTextEditorHandle } from '../RichTextEditor'

function renderEditor(defaultValue = '', onChange = vi.fn()) {
  const ref = createRef<RichTextEditorHandle>()
  const utils = render(
    <RichTextEditor ref={ref} defaultValue={defaultValue} onChange={onChange} />,
  )
  const editor = utils.container.querySelector('.journal-rich-text') as HTMLDivElement
  return { ref, onChange, editor, ...utils }
}

describe('RichTextEditor', () => {
  it('writes the initial HTML once on mount', () => {
    const { editor } = renderEditor('<p>hello <strong>world</strong></p>')
    expect(editor.innerHTML).toBe('<p>hello <strong>world</strong></p>')
  })

  it('renders toolbarExtra controls in the toolbar', () => {
    render(
      <RichTextEditor
        defaultValue=""
        onChange={vi.fn()}
        toolbarExtra={<button title="Dictate">mic</button>}
      />,
    )
    expect(screen.getByTitle('Dictate')).toBeDefined()
  })

  describe('insertText handle', () => {
    it('appends at the end when the selection is outside the editor', () => {
      const { ref, editor, onChange } = renderEditor('<p>existing</p>')
      window.getSelection()?.removeAllRanges()

      ref.current!.insertText('dictated')

      expect(editor.textContent).toBe('existing dictated')
      expect(onChange).toHaveBeenCalledTimes(1)
      const [html] = onChange.mock.calls[0]!
      expect(html).toContain('dictated')
    })

    it('inserts at the caret when the selection is inside the editor', () => {
      const { ref, editor } = renderEditor('<p>one two</p>')
      const textNode = editor.querySelector('p')!.firstChild as Text

      // Place the caret between "one " and "two"
      const range = document.createRange()
      range.setStart(textNode, 4)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      ref.current!.insertText('inserted ')

      expect(editor.textContent).toBe('one inserted two')
    })

    it('adds a separating space when jammed against a word', () => {
      const { ref, editor } = renderEditor('<p>word</p>')
      const textNode = editor.querySelector('p')!.firstChild as Text
      const range = document.createRange()
      range.setStart(textNode, 4) // caret right after "word"
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      ref.current!.insertText('next')

      expect(editor.textContent).toBe('word next')
    })

    it('does not add a space after existing whitespace', () => {
      const { ref, editor } = renderEditor('<p>word </p>')
      const textNode = editor.querySelector('p')!.firstChild as Text
      const range = document.createRange()
      range.setStart(textNode, 5) // caret after the trailing space
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      ref.current!.insertText('next')

      expect(editor.textContent).toBe('word next')
    })

    it('replaces a selected range with the inserted text', () => {
      const { ref, editor } = renderEditor('<p>delete THIS now</p>')
      const textNode = editor.querySelector('p')!.firstChild as Text
      const range = document.createRange()
      range.setStart(textNode, 7)
      range.setEnd(textNode, 11) // selects "THIS"
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      ref.current!.insertText('THAT')

      expect(editor.textContent).toBe('delete THAT now')
    })

    it('ignores empty text and emits no change', () => {
      const { ref, editor, onChange } = renderEditor('<p>keep</p>')
      ref.current!.insertText('')
      expect(editor.textContent).toBe('keep')
      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
