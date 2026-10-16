export interface StitchFragment {
  id: string
  swipeIndex: number
  start: number
  end: number
  text: string
  sourceKind?: SelectableSourceBlockKind
  sourceLabel?: string
}

export type SelectableSourceBlockKind = 'paragraph' | 'html-island' | 'resolved-island'

export interface SelectableSourceBlock {
  kind: SelectableSourceBlockKind
  start: number
  end: number
  label?: string
}

type SourceRange = { start: number; end: number; kind: SelectableSourceBlockKind; label?: string }

const HTML_ISLAND_TAGS = new Set([
  'div', 'section', 'article', 'aside', 'nav', 'main', 'header', 'footer',
  'form', 'fieldset', 'figure', 'details', 'html', 'body',
])
const VOID_HTML_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findMarkdownFenceRanges(text: string): SourceRange[] {
  const ranges: SourceRange[] = []
  const lineRe = /.*(?:\r\n|\n|\r|$)/g
  let open: { start: number; marker: string; length: number } | null = null
  let line: RegExpExecArray | null
  while ((line = lineRe.exec(text)) !== null) {
    const lineText = line[0].replace(/\r?\n$|\r$/, '')
    if (!open) {
      const startMatch = lineText.match(/^\s{0,3}(`{3,}|~{3,})/)
      if (startMatch) open = { start: line.index, marker: startMatch[1][0], length: startMatch[1].length }
    } else {
      const closeRe = new RegExp(`^\\s{0,3}${escapeRegex(open.marker)}{${open.length},}\\s*$`)
      if (closeRe.test(lineText)) {
        ranges.push({ kind: 'paragraph', start: open.start, end: line.index + line[0].length })
        open = null
      }
    }
    if (line[0].length === 0) break
  }
  if (open) ranges.push({ kind: 'paragraph', start: open.start, end: text.length })
  return ranges
}

function mergeRanges(ranges: SourceRange[]): SourceRange[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: SourceRange[] = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (!previous || range.start >= previous.end) {
      merged.push({ ...range })
      continue
    }
    if (range.end <= previous.end) continue
    previous.end = range.end
  }
  return merged
}

function findBalancedElementEnd(text: string, start: number): number | null {
  const opening = text.slice(start).match(/^<([A-Za-z][\w:-]*)\b[^>]*>/)
  if (!opening) return null
  const tag = opening[1].toLowerCase()
  const openingText = opening[0]
  const openingEnd = start + openingText.length
  if (/\/\s*>$/.test(openingText) || VOID_HTML_TAGS.has(tag)) return openingEnd

  const matcher = new RegExp(`<\\/?${escapeRegex(tag)}\\b[^>]*>`, 'gi')
  matcher.lastIndex = start
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = matcher.exec(text)) !== null) {
    const token = match[0]
    if (token.startsWith('</')) {
      depth -= 1
      if (depth === 0) return match.index + token.length
    } else if (!/\/\s*>$/.test(token)) {
      depth += 1
    }
  }
  return null
}

function findResolvedIslandRanges(text: string, skipRanges: readonly SourceRange[]): SourceRange[] {
  const ranges: SourceRange[] = []
  const startRe = /<!--\s*([A-Za-z0-9][A-Za-z0-9_-]*?)_START\s*-->/gi
  let match: RegExpExecArray | null
  while ((match = startRe.exec(text)) !== null) {
    if (rangeContains(skipRanges, match.index)) continue
    const stem = match[1]
    const endRe = new RegExp(`<!--\\s*${escapeRegex(stem)}_END\\s*-->`, 'gi')
    endRe.lastIndex = startRe.lastIndex
    const endMatch = endRe.exec(text)
    let end: number
    if (endMatch) {
      end = endMatch.index + endMatch[0].length
    } else {
      const tail = text.slice(startRe.lastIndex)
      const blank = tail.match(/\r?\n[\t ]*\r?\n/)
      end = blank?.index === undefined ? startRe.lastIndex : startRe.lastIndex + blank.index
    }
    ranges.push({
      kind: 'resolved-island',
      start: match.index,
      end,
      label: stem.replace(/[_-]+/g, ' ').trim(),
    })
    if (end > startRe.lastIndex) startRe.lastIndex = end
  }
  return ranges
}

function rangeContains(ranges: readonly SourceRange[], index: number): boolean {
  return ranges.some((range) => index >= range.start && index < range.end)
}

function findHtmlIslandRanges(text: string, protectedRanges: readonly SourceRange[], skipRanges: readonly SourceRange[]): SourceRange[] {
  const ranges: SourceRange[] = []
  const openingRe = /<(div|section|article|aside|nav|main|header|footer|form|fieldset|figure|details|html|body)\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = openingRe.exec(text)) !== null) {
    if (rangeContains(skipRanges, match.index) || rangeContains(protectedRanges, match.index) || rangeContains(ranges, match.index)) continue
    if (/\bdata-no-island(?=[\s=>"'/]|$)/i.test(match[0])) continue
    const tag = match[1].toLowerCase()
    if (!HTML_ISLAND_TAGS.has(tag)) continue
    const end = findBalancedElementEnd(text, match.index)
    if (end === null) continue
    const raw = text.slice(match.index, end)
    if (!/<style\b/i.test(raw)) continue
    ranges.push({ kind: 'html-island', start: match.index, end, label: 'HTML island' })
    openingRe.lastIndex = end
  }

  const styleRe = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi
  while ((match = styleRe.exec(text)) !== null) {
    if (rangeContains(skipRanges, match.index) || rangeContains(protectedRanges, match.index) || rangeContains(ranges, match.index)) continue
    let end = match.index + match[0].length
    let cursor = end
    while (cursor < text.length) {
      const whitespace = text.slice(cursor).match(/^\s*/)?.[0] ?? ''
      const nextStart = cursor + whitespace.length
      if (nextStart >= text.length || text[nextStart] !== '<' || text.startsWith('<!--', nextStart)) break
      const siblingEnd = findBalancedElementEnd(text, nextStart)
      if (siblingEnd === null) break
      end = siblingEnd
      cursor = siblingEnd
    }
    ranges.push({ kind: 'html-island', start: match.index, end, label: 'HTML island' })
    styleRe.lastIndex = end
  }
  return ranges
}

function trimLineBreakEdges(text: string, start: number, end: number): { start: number; end: number } | null {
  let left = start
  let right = end
  while (left < right && (text[left] === '\r' || text[left] === '\n')) left += 1
  while (right > left && (text[right - 1] === '\r' || text[right - 1] === '\n')) right -= 1
  return right > left && text.slice(left, right).trim() ? { start: left, end: right } : null
}

function paragraphRanges(text: string, start: number, end: number, skipCommentRanges: readonly SourceRange[] = []): SourceRange[] {
  const ranges: SourceRange[] = []
  const commentRe = /<!--[\s\S]*?-->/g
  commentRe.lastIndex = start
  let segmentStart = start

  const addSegment = (from: number, to: number) => {
    if (to <= from) return
    let cursor = from
    let fence: string | null = null
    const lineRe = /.*(?:\r\n|\n|\r|$)/g
    lineRe.lastIndex = from
    let paragraphStart = from
    let line: RegExpExecArray | null
    while ((line = lineRe.exec(text)) !== null && line.index < to) {
      const lineEnd = Math.min(to, line.index + line[0].length)
      const lineText = text.slice(line.index, lineEnd).replace(/\r?\n$|\r$/, '')
      const fenceMatch = lineText.match(/^\s*(```+|~~~+)/)
      if (fenceMatch) {
        const token = fenceMatch[1][0]
        if (fence === null) fence = token
        else if (fence === token) fence = null
      }
      if (fence === null && /^\s*$/.test(lineText)) {
        const trimmed = trimLineBreakEdges(text, paragraphStart, line.index)
        if (trimmed) ranges.push({ kind: 'paragraph', ...trimmed })
        paragraphStart = lineEnd
      }
      cursor = lineEnd
      if (line[0].length === 0) break
    }
    const trimmed = trimLineBreakEdges(text, paragraphStart, to)
    if (trimmed) ranges.push({ kind: 'paragraph', ...trimmed })
    void cursor
  }

  let comment: RegExpExecArray | null
  while ((comment = commentRe.exec(text)) !== null && comment.index < end) {
    if (rangeContains(skipCommentRanges, comment.index)) continue
    if (comment.index >= segmentStart) addSegment(segmentStart, comment.index)
    segmentStart = Math.min(end, comment.index + comment[0].length)
  }
  addSegment(segmentStart, end)
  return ranges
}

export function findSelectableSourceBlocks(text: string): SelectableSourceBlock[] {
  if (!text) return []
  const fences = findMarkdownFenceRanges(text)
  const resolved = findResolvedIslandRanges(text, fences)
  const html = findHtmlIslandRanges(text, resolved, fences)
  const islands = mergeRanges([...resolved, ...html])
  const blocks: SourceRange[] = []
  let cursor = 0
  for (const island of islands) {
    blocks.push(...paragraphRanges(text, cursor, island.start, fences))
    blocks.push(island)
    cursor = island.end
  }
  blocks.push(...paragraphRanges(text, cursor, text.length, fences))
  return blocks
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start)
}

export function parseMessageIdFromScope(scope: string, suffix: string): string | null {
  const prefix = 'message:'
  if (!scope.startsWith(prefix) || !scope.endsWith(suffix)) return null
  const id = scope.slice(prefix.length, -suffix.length)
  return id || null
}

export function overlapsExisting(
  fragments: readonly StitchFragment[],
  swipeIndex: number,
  start: number,
  end: number,
): boolean {
  return fragments.some((fragment) => (
    fragment.swipeIndex === swipeIndex
    && start < fragment.end
    && end > fragment.start
  ))
}

export function composeFragments(fragments: readonly StitchFragment[]): string {
  return fragments
    .map((fragment) => fragment.text.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, ''))
    .filter((text) => text.trim().length > 0)
    .join('\n\n')
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return [...items]
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
