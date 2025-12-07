import React, { useMemo } from 'react'

/**
 * Lightweight, secure markdown renderer for AI responses.
 * Parses markdown to React elements (no innerHTML for security).
 *
 * Supported syntax:
 * - Code blocks: ```language\n...\n```
 * - Inline code: `code`
 * - Bold: **text**
 * - Italic: *text* or _text_
 * - Links: [text](url)
 * - Unordered lists: - item or * item
 * - Ordered lists: 1. item
 * - Headers: # ## ###
 */

interface MarkdownContentProps {
  content: string
  className?: string
}

interface ParsedBlock {
  type: 'paragraph' | 'code-block' | 'header' | 'list'
  content: string
  language?: string
  level?: number
  listType?: 'ordered' | 'unordered'
  items?: string[]
}

/**
 * Sanitize URL to prevent XSS.
 * Only allows http/https protocols.
 */
function sanitizeUrl(url: string): string | null {
  try {
    const trimmed = url.trim()
    const parsed = new globalThis.URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }
    return parsed.href
  } catch {
    // Relative URLs or invalid URLs - reject for safety
    return null
  }
}

/**
 * Parse inline markdown (bold, italic, code, links) within a text string.
 * Returns an array of React elements.
 */
function parseInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const elements: React.ReactNode[] = []
  let remaining = text
  let keyIndex = 0

  const getKey = (): string => `${keyPrefix}-${keyIndex++}`

  while (remaining.length > 0) {
    // Check for inline code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch && codeMatch[1] !== undefined) {
      elements.push(
        <code
          key={getKey()}
          style={{
            backgroundColor: 'var(--color-fill-2)',
            padding: '2px 6px',
            borderRadius: 3,
            fontFamily: 'monospace',
            fontSize: '0.9em',
          }}
        >
          {codeMatch[1]}
        </code>,
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Check for bold: **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch && boldMatch[1] !== undefined) {
      const boldKey = getKey()
      elements.push(<strong key={boldKey}>{parseInlineMarkdown(boldMatch[1], boldKey)}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Check for italic: *text* or _text_
    const italicMatch = remaining.match(/^\*([^*]+)\*/) ?? remaining.match(/^_([^_]+)_/)
    if (italicMatch && italicMatch[1] !== undefined) {
      const italicKey = getKey()
      elements.push(<em key={italicKey}>{parseInlineMarkdown(italicMatch[1], italicKey)}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // Check for links: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch && linkMatch[1] !== undefined && linkMatch[2] !== undefined) {
      const linkText = linkMatch[1]
      const url = sanitizeUrl(linkMatch[2])
      if (url) {
        elements.push(
          <a
            key={getKey()}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary-6)' }}
          >
            {linkText}
          </a>,
        )
      } else {
        // Invalid URL - render as plain text
        elements.push(<span key={getKey()}>{linkText}</span>)
      }
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Find next special character (backtick, asterisk, underscore, or open bracket)
    const nextSpecialIndex = remaining.search(/[`*_[]/)
    if (nextSpecialIndex === -1) {
      // No more special characters - add rest as text
      elements.push(<span key={getKey()}>{remaining}</span>)
      break
    } else if (nextSpecialIndex === 0) {
      // Special character at start but didn't match pattern - treat as literal
      elements.push(<span key={getKey()}>{remaining[0]}</span>)
      remaining = remaining.slice(1)
    } else {
      // Add text up to next special character
      elements.push(<span key={getKey()}>{remaining.slice(0, nextSpecialIndex)}</span>)
      remaining = remaining.slice(nextSpecialIndex)
    }
  }

  return elements
}

/**
 * Parse markdown content into blocks (paragraphs, code blocks, headers, lists).
 */
function parseBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  const lines = content.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) {
      i++
      continue
    }

    // Check for code block: ```language
    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || undefined
      const codeLines: string[] = []
      i++

      while (i < lines.length) {
        const codeLine = lines[i]
        if (codeLine === undefined || codeLine.startsWith('```')) {
          break
        }
        codeLines.push(codeLine)
        i++
      }

      blocks.push({
        type: 'code-block',
        content: codeLines.join('\n'),
        language,
      })

      i++ // Skip closing ```
      continue
    }

    // Check for headers: # ## ###
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch && headerMatch[1] !== undefined && headerMatch[2] !== undefined) {
      blocks.push({
        type: 'header',
        content: headerMatch[2],
        level: headerMatch[1].length,
      })
      i++
      continue
    }

    // Check for unordered list: - item or * item
    if (line.match(/^[-*]\s+/)) {
      const items: string[] = []
      while (i < lines.length) {
        const listLine = lines[i]
        if (listLine === undefined || !listLine.match(/^[-*]\s+/)) {
          break
        }
        items.push(listLine.replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push({
        type: 'list',
        content: '',
        listType: 'unordered',
        items,
      })
      continue
    }

    // Check for ordered list: 1. item
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = []
      while (i < lines.length) {
        const listLine = lines[i]
        if (listLine === undefined || !listLine.match(/^\d+\.\s+/)) {
          break
        }
        items.push(listLine.replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push({
        type: 'list',
        content: '',
        listType: 'ordered',
        items,
      })
      continue
    }

    // Empty line - skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph - collect consecutive non-empty, non-special lines
    const paragraphLines: string[] = [line]
    i++
    while (i < lines.length) {
      const nextLine = lines[i]
      if (nextLine === undefined) break
      if (nextLine.trim() === '') break
      if (nextLine.startsWith('```')) break
      if (nextLine.match(/^#{1,3}\s+/)) break
      if (nextLine.match(/^[-*]\s+/)) break
      if (nextLine.match(/^\d+\.\s+/)) break
      paragraphLines.push(nextLine)
      i++
    }

    blocks.push({
      type: 'paragraph',
      content: paragraphLines.join('\n'),
    })
  }

  return blocks
}

/**
 * Render a parsed block to React element.
 */
function renderBlock(block: ParsedBlock, index: number): React.ReactNode {
  const key = `block-${index}`

  switch (block.type) {
    case 'code-block':
      return (
        <pre
          key={key}
          style={{
            backgroundColor: 'var(--color-fill-2)',
            padding: 12,
            borderRadius: 6,
            overflow: 'auto',
            marginBottom: 12,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <code style={{ fontFamily: 'monospace' }}>{block.content}</code>
        </pre>
      )

    case 'header': {
      const fontSize = block.level === 1 ? 20 : block.level === 2 ? 18 : 16
      const marginTop = block.level === 1 ? 16 : 12
      return (
        <div
          key={key}
          style={{
            fontSize,
            fontWeight: 600,
            marginTop,
            marginBottom: 8,
          }}
        >
          {parseInlineMarkdown(block.content, key)}
        </div>
      )
    }

    case 'list': {
      const ListTag = block.listType === 'ordered' ? 'ol' : 'ul'
      return (
        <ListTag
          key={key}
          style={{
            marginBottom: 12,
            paddingLeft: 24,
          }}
        >
          {block.items?.map((item, itemIndex) => (
            <li key={`${key}-item-${itemIndex}`} style={{ marginBottom: 4 }}>
              {parseInlineMarkdown(item, `${key}-item-${itemIndex}`)}
            </li>
          ))}
        </ListTag>
      )
    }

    case 'paragraph':
    default:
      return (
        <div key={key} style={{ marginBottom: 12, lineHeight: 1.6 }}>
          {parseInlineMarkdown(block.content, key)}
        </div>
      )
  }
}

/**
 * MarkdownContent component - renders markdown as React elements.
 *
 * Security: Uses React elements (not innerHTML), sanitizes URLs.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className }) => {
  const renderedContent = useMemo(() => {
    if (!content) return null

    const blocks = parseBlocks(content)
    return blocks.map((block, index) => renderBlock(block, index))
  }, [content])

  return (
    <div className={className} style={{ fontSize: 14 }}>
      {renderedContent}
    </div>
  )
}
