import { describe, expect, test } from 'bun:test'
import { composeFragments, findSelectableSourceBlocks, moveItem, overlapsExisting, parseMessageIdFromScope } from '../src/shared'

describe('Stitch shared logic', () => {
  test('parses message mount scopes without eating ids', () => {
    expect(parseMessageIdFromScope('message:abc-123:actions', ':actions')).toBe('abc-123')
    expect(parseMessageIdFromScope('message:abc-123:bubble:footer', ':bubble:footer')).toBe('abc-123')
  })

  test('detects overlapping fragments on the same swipe only', () => {
    const fragments = [{ id: 'a', swipeIndex: 2, start: 10, end: 20, text: 'x' }]
    expect(overlapsExisting(fragments, 2, 15, 22)).toBe(true)
    expect(overlapsExisting(fragments, 2, 20, 25)).toBe(false)
    expect(overlapsExisting(fragments, 3, 15, 22)).toBe(false)
  })

  test('turns visible prose into independently selectable paragraph blocks', () => {
    const text = 'first paragraph\n\nsecond line\nstill second\n\nthird'
    const blocks = findSelectableSourceBlocks(text)
    expect(blocks.map((block) => ({ kind: block.kind, text: text.slice(block.start, block.end) }))).toEqual([
      { kind: 'paragraph', text: 'first paragraph' },
      { kind: 'paragraph', text: 'second line\nstill second' },
      { kind: 'paragraph', text: 'third' },
    ])
  })

  test('keeps resolver envelopes out of adjacent paragraph selections', () => {
    const text = '<!-- GABI_RESOLVED_START -->\n{"mode":"scene-monitor"}\n<!-- GABI_RESOLVED_END -->\nVisible paragraph.\n\nNext paragraph.'
    const blocks = findSelectableSourceBlocks(text)
    expect(blocks.map((block) => ({ kind: block.kind, label: block.label, text: text.slice(block.start, block.end) }))).toEqual([
      {
        kind: 'resolved-island',
        label: 'GABI RESOLVED',
        text: '<!-- GABI_RESOLVED_START -->\n{"mode":"scene-monitor"}\n<!-- GABI_RESOLVED_END -->',
      },
      { kind: 'paragraph', label: undefined, text: 'Visible paragraph.' },
      { kind: 'paragraph', label: undefined, text: 'Next paragraph.' },
    ])
  })

  test('exposes styled HTML shadow islands as a single selectable source block', () => {
    const text = 'Before\n\n<div class="card"><style>.card{display:block}</style><p>Island copy</p></div>\n\nAfter'
    const blocks = findSelectableSourceBlocks(text)
    expect(blocks.map((block) => ({ kind: block.kind, text: text.slice(block.start, block.end) }))).toEqual([
      { kind: 'paragraph', text: 'Before' },
      { kind: 'html-island', text: '<div class="card"><style>.card{display:block}</style><p>Island copy</p></div>' },
      { kind: 'paragraph', text: 'After' },
    ])
  })

  test('does not split fenced code on blank lines', () => {
    const text = '```txt\nline one\n\nline two\n```\n\nAfter'
    const blocks = findSelectableSourceBlocks(text)
    expect(blocks.map((block) => text.slice(block.start, block.end))).toEqual([
      '```txt\nline one\n\nline two\n```',
      'After',
    ])
  })

  test('does not mistake HTML or resolver markers inside code fences for islands', () => {
    const text = '```html\n<!-- DEMO_START -->\n<div><style>x{}</style><p>x</p></div>\n<!-- DEMO_END -->\n```\n\nAfter'
    const blocks = findSelectableSourceBlocks(text)
    expect(blocks.map((block) => ({ kind: block.kind, text: text.slice(block.start, block.end) }))).toEqual([
      { kind: 'paragraph', text: '```html\n<!-- DEMO_START -->\n<div><style>x{}</style><p>x</p></div>\n<!-- DEMO_END -->\n```' },
      { kind: 'paragraph', text: 'After' },
    ])
  })

  test('composes fragments into an editable markdown surface', () => {
    expect(composeFragments([
      { id: 'a', swipeIndex: 0, start: 0, end: 5, text: '  indented first' },
      { id: 'b', swipeIndex: 1, start: 0, end: 6, text: '\nsecond\n' },
    ])).toBe('  indented first\n\nsecond')
  })

  test('reorders without mutating the original array', () => {
    const original = ['a', 'b', 'c']
    expect(moveItem(original, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(original).toEqual(['a', 'b', 'c'])
  })
})
