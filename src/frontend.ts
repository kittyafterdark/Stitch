import {
  composeFragments,
  findSelectableSourceBlocks,
  moveItem,
  overlapsExisting,
  parseMessageIdFromScope,
  type SelectableSourceBlock,
  type StitchFragment,
} from './shared'

type AnyRecord = Record<string, any>
type FrontendContext = AnyRecord

type StitchOpenResult = {
  type: 'stitch_open_result'
  requestId: string
  chatId: string
  messageId: string
  swipes: string[]
  activeSwipe: number
  revision: string
}

type StitchSession = {
  chatId: string
  messageId: string
  swipes: string[]
  revision: string
  currentSwipe: number
  fragments: StitchFragment[]
  step: 0 | 1 | 2
  draft: string
  draftDirty: boolean
  notice: string
}

const CSS = `
.stitch-modal-root {
  height: calc(
    var(
      --app-interactive-viewport-height,
      calc(var(--app-scaled-viewport-height, 100vh) - var(--app-interactive-safe-top, env(safe-area-inset-top, 0px)))
    ) - 124px
  );
  min-height: 0;
  color: var(--lumiverse-text);
}
.stitch-host-close {
  width: 28px;
  height: 28px;
  margin: -4px -4px -4px 8px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--lumiverse-text-dim);
  display: inline-grid;
  place-items: center;
  cursor: pointer;
  flex: 0 0 28px;
  transition: background 120ms ease, color 120ms ease;
}
.stitch-host-close:hover {
  background: var(--lumiverse-fill-subtle);
  color: var(--lumiverse-text);
}
.stitch-host-close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--lumiverse-accent) 55%, transparent);
  outline-offset: 1px;
}
.stitch-host-close svg { width: 16px; height: 16px; }
.stitch-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.stitch-stepper {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 2px 2px 4px;
}
.stitch-step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--lumiverse-text-dim);
  font-size: 12px;
  font-weight: 650;
  min-width: 0;
}
.stitch-step:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 28px;
  right: -4px;
  top: 11px;
  height: 1px;
  background: var(--lumiverse-border);
  z-index: 0;
}
.stitch-step-dot {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border-radius: 999px;
  border: 1px solid var(--lumiverse-border);
  background: var(--lumiverse-fill-heavy);
  display: grid;
  place-items: center;
  font-size: 10px;
  position: relative;
  z-index: 1;
}
.stitch-step.is-active,
.stitch-step.is-done { color: var(--lumiverse-text); }
.stitch-step.is-active .stitch-step-dot,
.stitch-step.is-done .stitch-step-dot {
  border-color: color-mix(in srgb, var(--lumiverse-accent) 60%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-accent) 16%, var(--lumiverse-fill-heavy));
  color: var(--lumiverse-accent);
}
.stitch-stage {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stitch-stage-head,
.stitch-footer,
.stitch-source-toolbar,
.stitch-piece-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stitch-stage-head { justify-content: space-between; }
.stitch-stage-copy { min-width: 0; }
.stitch-kicker {
  color: var(--lumiverse-text-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  font-weight: 700;
}
.stitch-stage-title {
  margin-top: 3px;
  font-size: 15px;
  font-weight: 700;
}
.stitch-source-wrap {
  min-height: 0;
  flex: 1 1 320px;
  border: 1px solid var(--lumiverse-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 55%, transparent);
  overflow: auto;
}
.stitch-source {
  min-height: 220px;
  padding: 14px 16px 24px;
  overflow-wrap: anywhere;
  line-height: 1.62;
  user-select: text;
  cursor: text;
}
.stitch-source .stitch-source-block {
  user-select: text;
  -webkit-user-select: text;
  position: relative;
  margin: 0 0 6px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 9px;
  white-space: pre-wrap;
  transition: background 120ms ease, border-color 120ms ease;
}
.stitch-source-block:hover {
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 72%, transparent);
}
.stitch-source-block.is-selected {
  background: color-mix(in srgb, var(--lumiverse-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--lumiverse-accent) 34%, transparent);
}
.stitch-source-block.is-partial {
  border-color: color-mix(in srgb, var(--lumiverse-accent) 22%, transparent);
}
.stitch-source-block mark {
  color: inherit;
  background: color-mix(in srgb, var(--lumiverse-accent) 24%, transparent);
  border-radius: 3px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lumiverse-accent) 24%, transparent);
}
.stitch-source-island {
  margin: 4px 0 10px;
  padding: 10px 11px;
  border: 1px dashed color-mix(in srgb, var(--lumiverse-border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--lumiverse-fill-heavy) 68%, transparent);
  cursor: pointer;
  user-select: none;
}
.stitch-source-island:hover {
  border-color: color-mix(in srgb, var(--lumiverse-accent) 42%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-accent) 8%, var(--lumiverse-fill-heavy));
}
.stitch-source-island.is-selected {
  border-style: solid;
  border-color: color-mix(in srgb, var(--lumiverse-accent) 52%, var(--lumiverse-border));
  background: color-mix(in srgb, var(--lumiverse-accent) 13%, var(--lumiverse-fill-heavy));
}
.stitch-source-island-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: var(--lumiverse-text-dim);
  font-size: 10px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: .06em;
}
.stitch-source-island-preview {
  color: var(--lumiverse-text);
  font-size: 12px;
  line-height: 1.45;
  white-space: normal;
}
.stitch-source-hint {
  color: var(--lumiverse-text-dim);
  font-size: 11px;
}
.stitch-source-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
}
.stitch-source-actions,
.stitch-nav,
.stitch-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.stitch-button {
  border: 1px solid var(--lumiverse-border);
  border-radius: 9px;
  min-height: 34px;
  padding: 7px 11px;
  background: var(--lumiverse-fill-heavy);
  color: var(--lumiverse-text);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
.stitch-button:hover:not(:disabled) { background: var(--lumiverse-fill-subtle); }
.stitch-button:disabled { opacity: .42; cursor: default; }
.stitch-button.is-primary {
  background: var(--lumiverse-accent);
  border-color: var(--lumiverse-accent);
  color: var(--lumiverse-accent-contrast, white);
}
.stitch-button.is-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lumiverse-accent) 88%, var(--lumiverse-text));
}
.stitch-button.is-icon {
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
}
.stitch-button svg,
.stitch-trigger-minimal svg { width: 15px; height: 15px; }
.stitch-trigger-action { padding: 5px !important; }
.stitch-trigger-action svg { width: 13px; height: 13px; flex: 0 0 13px; }
.stitch-thread {
  border-top: 1px solid var(--lumiverse-border);
  padding-top: 10px;
  display: flex;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.stitch-thread-empty {
  color: var(--lumiverse-text-dim);
  font-size: 12px;
}
.stitch-chip {
  flex: 0 0 auto;
  max-width: 220px;
  border: 1px solid var(--lumiverse-border);
  border-radius: 999px;
  padding: 5px 9px;
  background: var(--lumiverse-fill-heavy);
  color: var(--lumiverse-text-dim);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stitch-chip strong { color: var(--lumiverse-text); margin-right: 5px; }
.stitch-arrange-list {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 2px;
}
.stitch-piece {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid var(--lumiverse-border);
  border-radius: 12px;
  background: var(--lumiverse-fill-heavy);
}
.stitch-piece[draggable='true'] { cursor: grab; }
.stitch-piece.is-dragging { opacity: .48; }
.stitch-piece.is-drop-target { border-color: var(--lumiverse-accent); box-shadow: inset 0 0 0 1px var(--lumiverse-accent); }
.stitch-drag-handle {
  color: var(--lumiverse-text-dim);
  display: grid;
  place-items: center;
  touch-action: none;
  cursor: grab;
}
.stitch-drag-handle svg { width: 16px; height: 16px; }
.stitch-piece-copy { min-width: 0; }
.stitch-piece-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 4px;
  color: var(--lumiverse-text-dim);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
}
.stitch-piece-preview {
  font-size: 12px;
  line-height: 1.45;
  color: var(--lumiverse-text);
  overflow: hidden;
  display: block;
  max-height: 4.35em;
}
.stitch-piece-preview.is-truncated {
  mask-image: linear-gradient(to bottom, black 45%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, black 45%, transparent);
}
.stitch-piece-preview.is-expanded { max-height: none; white-space: pre-wrap; }
.stitch-button.stitch-read-more {
  min-height: 24px;
  margin-top: 5px;
  padding: 3px 7px;
  font-size: 11px;
  font-weight: 500;
  color: var(--lumiverse-text-dim);
  background: transparent;
  border-color: color-mix(in srgb, var(--lumiverse-border) 65%, transparent);
  border-radius: 6px;
}
.stitch-button.stitch-read-more:focus-visible { outline: 2px solid var(--lumiverse-accent); outline-offset: 2px; }
.stitch-preview-frame { width: 100%; height: 55vh; border: 0; background: var(--lumiverse-bg-opaque, var(--lumiverse-bg, Canvas)); }
.stitch-preview-native { height: 55vh; overflow: auto; padding: 12px; overflow-wrap: anywhere; }
.stitch-preview-source { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 30vh; overflow: auto; }
.stitch-island-row { display: flex; align-items: center; gap: 8px; }
.stitch-island-row > .stitch-source-island { flex: 1; min-width: 0; text-align: left; color: inherit; font: inherit; }
.stitch-step-label { position: relative; z-index: 1; background: var(--lumiverse-bg, var(--lumiverse-fill-heavy)); }
.stitch-piece-actions { gap: 4px; flex-wrap: wrap; }
.stitch-arrange-tools { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex: 0 0 auto; }
.stitch-arrange-tools .stitch-read-more { margin-top: 0; }
.stitch-editor {
  min-height: 0;
  flex: 1 1 420px;
  width: 100%;
  resize: none;
  border: 1px solid var(--lumiverse-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--lumiverse-fill-subtle) 55%, transparent);
  color: var(--lumiverse-text);
  padding: 17px 18px;
  font: inherit;
  font-size: 13px;
  line-height: 1.58;
  outline: none;
}
.stitch-editor:focus {
  border-color: color-mix(in srgb, var(--lumiverse-accent) 58%, var(--lumiverse-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lumiverse-accent) 12%, transparent);
}
.stitch-notice {
  min-height: 18px;
  color: var(--lumiverse-text-dim);
  font-size: 11px;
  line-height: 1.4;
}
.stitch-notice.is-error { color: var(--lumiverse-danger, #e76d77); }
.stitch-footer {
  justify-content: space-between;
  padding-top: 2px;
}
.stitch-count {
  color: var(--lumiverse-text-dim);
  font-size: 11px;
}
.stitch-trigger-minimal {
  margin: 8px 0 2px auto;
  width: max-content;
  border: 1px solid var(--lumiverse-border);
  border-radius: 999px;
  padding: 5px 9px;
  background: var(--lumiverse-fill-heavy);
  color: var(--lumiverse-text-dim);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.stitch-trigger-minimal:hover { color: var(--lumiverse-text); background: var(--lumiverse-fill-subtle); }
@media (max-width: 680px) {
  .stitch-step { justify-content: center; gap: 0; }
  .stitch-step .stitch-step-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .stitch-step:not(:last-child)::after { left: calc(50% + 16px); right: calc(-50% + 8px); }
  .stitch-source { padding: 14px 13px 22px; font-size: 13px; }
  .stitch-source-toolbar { align-items: stretch; }
  .stitch-source-actions { flex: 1 1 100%; }
  .stitch-source-actions .stitch-button { flex: 1 1 auto; }
  .stitch-piece { grid-template-columns: 24px minmax(0, 1fr); }
  .stitch-piece-actions { grid-column: 2; justify-content: flex-end; }
  .stitch-footer { align-items: flex-end; }
}
`

function svg(paths: Array<{ d: string; fill?: string }>, viewBox = '0 0 24 24'): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  node.setAttribute('viewBox', viewBox)
  node.setAttribute('fill', 'none')
  node.setAttribute('aria-hidden', 'true')
  node.setAttribute('focusable', 'false')
  node.setAttribute('stroke', 'currentColor')
  node.setAttribute('stroke-width', '1.8')
  node.setAttribute('stroke-linecap', 'round')
  node.setAttribute('stroke-linejoin', 'round')
  for (const spec of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', spec.d)
    if (spec.fill) path.setAttribute('fill', spec.fill)
    node.appendChild(path)
  }
  return node
}

function stitchIcon() {
  return svg([
    { d: 'M7.25 16.75 17.9 6.1' },
    { d: 'm16.55 4.75 2.7 2.7' },
    { d: 'M6.9 16.95c-3.35.7-3.8 4.55.45 4.55 4.55 0 5.45-3.2 2.15-3.2-2.55 0-2.1 2.95.3 2.95' },
    { d: 'M18.35 4.3c.75-.75 1.8-.9 2.35-.35.55.55.4 1.6-.35 2.35' },
  ])
}

function chevronIcon(direction: 'left' | 'right' | 'up' | 'down') {
  const d = direction === 'left' ? 'm15 18-6-6 6-6'
    : direction === 'right' ? 'm9 18 6-6-6-6'
      : direction === 'up' ? 'm18 15-6-6-6 6'
        : 'm6 9 6 6 6-6'
  return svg([{ d }])
}

function gripIcon() {
  return svg([
    { d: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01' },
  ])
}

function trashIcon() {
  return svg([
    { d: 'M4 7h16' },
    { d: 'M10 11v6M14 11v6' },
    { d: 'm6 7 1 14h10l1-14' },
    { d: 'M9 7V4h6v3' },
  ])
}

function plusIcon() {
  return svg([{ d: 'M12 5v14M5 12h14' }])
}

function eyeIcon() {
  return svg([{ d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z' }, { d: 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' }])
}

function closeIcon() {
  return svg([
    { d: 'M18 6 6 18' },
    { d: 'm6 6 12 12' },
  ])
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function iconButton(label: string, icon: SVGSVGElement): HTMLButtonElement {
  const button = el('button', 'stitch-button is-icon')
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  button.appendChild(icon)
  return button
}

function textButton(label: string, options?: { primary?: boolean; icon?: SVGSVGElement }): HTMLButtonElement {
  const button = el('button', `stitch-button${options?.primary ? ' is-primary' : ''}`)
  button.type = 'button'
  if (options?.icon) button.appendChild(options.icon)
  button.append(document.createTextNode(label))
  return button
}

function shortPreview(text: string, max = 118): string {
  const flattened = text.replace(/\s+/g, ' ').trim()
  return flattened.length > max ? `${flattened.slice(0, max - 1)}…` : flattened
}

function messageIdFromActionScope(scope: string): string | null {
  return parseMessageIdFromScope(scope, ':actions')
}

function messageIdFromMinimalFooterScope(scope: string): string | null {
  return parseMessageIdFromScope(scope, ':minimal:footer')
}

function nodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').length
  let total = 0
  for (const child of node.childNodes) total += nodeTextLength(child)
  return total
}

function boundaryOffset(root: HTMLElement, container: Node, offset: number): number | null {
  let total = 0
  let found = false

  const visit = (node: Node): boolean => {
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        total += Math.max(0, Math.min((node.nodeValue ?? '').length, offset))
      } else {
        const count = Math.max(0, Math.min(node.childNodes.length, offset))
        for (let index = 0; index < count; index += 1) total += nodeTextLength(node.childNodes[index])
      }
      found = true
      return true
    }

    if (node.nodeType === Node.TEXT_NODE) {
      total += (node.nodeValue ?? '').length
      return false
    }

    for (const child of node.childNodes) {
      if (visit(child)) return true
    }
    return false
  }

  visit(root)
  return found ? total : null
}

function sourceBlockForNode(root: HTMLElement, node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  const block = element?.closest<HTMLElement>('[data-stitch-source-start][data-stitch-source-end]') ?? null
  return block && root.contains(block) ? block : null
}

function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const startBlock = sourceBlockForNode(root, range.startContainer)
  const endBlock = sourceBlockForNode(root, range.endContainer)
  if (!startBlock || startBlock !== endBlock || startBlock.dataset.stitchSourceKind !== 'paragraph') return null

  const blockStart = Number(startBlock.dataset.stitchSourceStart)
  if (!Number.isFinite(blockStart)) return null
  const start = boundaryOffset(startBlock, range.startContainer, range.startOffset)
  const end = boundaryOffset(startBlock, range.endContainer, range.endOffset)
  if (start === null || end === null) return null
  return {
    start: blockStart + Math.min(start, end),
    end: blockStart + Math.max(start, end),
  }
}

function islandPreview(raw: string, block: SelectableSourceBlock): string {
  if (block.kind === 'resolved-island') {
    return 'Display-resolved content. Select this block to preserve its exact source.'
  }
  try {
    const documentLike = new DOMParser().parseFromString(raw, 'text/html')
    documentLike.querySelectorAll('style, script, template, svg').forEach((node) => node.remove())
    const text = documentLike.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    return text ? shortPreview(text, 180) : 'Styled HTML content'
  } catch {
    return 'Styled HTML content'
  }
}

function uniqueId(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `stitch-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function setup(ctx: FrontendContext) {
  const removeStyle = ctx.dom.addStyle(CSS)
  const pending = new Map<string, {
    resolve: (value: AnyRecord) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  const actionButtons = new Map<string, Set<HTMLButtonElement>>()
  const minimalButtons = new Map<string, Set<HTMLButtonElement>>()
  let activeModal: AnyRecord | null = null
  let activeSession: StitchSession | null = null

  const trackButton = (map: Map<string, Set<HTMLButtonElement>>, messageId: string, button: HTMLButtonElement) => {
    const set = map.get(messageId) ?? new Set<HTMLButtonElement>()
    set.add(button)
    map.set(messageId, set)
    return () => {
      set.delete(button)
      if (set.size === 0) map.delete(messageId)
    }
  }

  const localMessage = (messageId: string): AnyRecord | null => {
    const recent = ctx.messages.getRecent(200) as AnyRecord[]
    return recent.find((message) => message.id === messageId) ?? null
  }

  const eligible = (messageId: string): boolean => {
    const message = localMessage(messageId)
    return !!message
      && message.is_user !== true
      && message.role !== 'user'
      && Number(message.index_in_chat ?? 1) !== 0
      && Array.isArray(message.swipes)
      && message.swipes.length > 1
  }

  const refreshMessageButton = (messageId: string) => {
    const visible = eligible(messageId)
    for (const button of actionButtons.get(messageId) ?? []) {
      button.hidden = !visible
      button.disabled = !visible
    }
    for (const button of minimalButtons.get(messageId) ?? []) {
      button.hidden = !visible
      button.disabled = !visible
    }
  }

  const refreshAllButtons = () => {
    for (const messageId of new Set([...actionButtons.keys(), ...minimalButtons.keys()])) {
      refreshMessageButton(messageId)
    }
  }

  const rpc = (type: string, payload: AnyRecord, timeoutMs = 15000): Promise<AnyRecord> => {
    const requestId = uniqueId()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('Stitch timed out waiting for its backend.'))
      }, timeoutMs)
      pending.set(requestId, { resolve, reject, timeout })
      ctx.sendToBackend({ type, requestId, ...payload })
    })
  }

  const unsubBackend = ctx.onBackendMessage((payload: AnyRecord) => {
    if (!payload || typeof payload !== 'object' || typeof payload.requestId !== 'string') return
    const waiter = pending.get(payload.requestId)
    if (!waiter) return
    clearTimeout(waiter.timeout)
    pending.delete(payload.requestId)
    if (payload.type === 'stitch_error' || payload.type === 'stitch_conflict') {
      waiter.reject(new Error(typeof payload.error === 'string' ? payload.error : 'Stitch backend error.'))
      return
    }
    waiter.resolve(payload)
  })

  const setBusyForMessage = (messageId: string, busy: boolean) => {
    for (const button of [...(actionButtons.get(messageId) ?? []), ...(minimalButtons.get(messageId) ?? [])]) {
      button.disabled = busy || !eligible(messageId)
      button.setAttribute('aria-busy', busy ? 'true' : 'false')
    }
  }

  const showEditor = (opened: StitchOpenResult) => {
    activeModal?.dismiss?.()
    const modal = ctx.ui.showModal({ title: 'Stitch', width: 100000, maxHeight: 100000, persistent: true })
    modal.root.classList.add('stitch-modal-root')

    // Spindle's generic modal centers against the full viewport. Stitch is a
    // near-fullscreen workspace, so explicitly honor Lumi's interactive top
    // safe area (desktop title bar / PWA window controls / iOS safe area).
    const modalBody = modal.root.parentElement instanceof HTMLElement ? modal.root.parentElement : null
    const modalContainer = modalBody?.parentElement instanceof HTMLElement ? modalBody.parentElement : null
    const modalBackdrop = modalContainer?.parentElement instanceof HTMLElement ? modalContainer.parentElement : null
    if (modalBackdrop) {
      modalBackdrop.style.top = 'var(--app-interactive-safe-top, env(safe-area-inset-top, 0px))'
      modalBackdrop.style.height = 'auto'
    }
    if (modalContainer) {
      modalContainer.style.maxHeight = 'calc(var(--app-interactive-viewport-height, calc(100vh - var(--app-interactive-safe-top, 0px))) - 24px)'
      const modalHeader = modalContainer.firstElementChild instanceof HTMLElement
        ? modalContainer.firstElementChild
        : null
      if (modalHeader) {
        const close = el('button', 'stitch-host-close')
        close.type = 'button'
        close.title = 'Close Stitch'
        close.setAttribute('aria-label', 'Close Stitch')
        close.appendChild(closeIcon())
        close.addEventListener('click', () => modal.dismiss())
        modalHeader.appendChild(close)
      }
    }

    activeModal = modal
    activeSession = {
      chatId: opened.chatId,
      messageId: opened.messageId,
      swipes: [...opened.swipes],
      revision: opened.revision,
      currentSwipe: Math.max(0, Math.min(opened.swipes.length - 1, opened.activeSwipe ?? 0)),
      fragments: [],
      step: 0,
      draft: '',
      draftDirty: false,
      notice: '',
    }

    const session = activeSession
    let pendingSelection: { start: number; end: number } | null = null
    let draggingId: string | null = null
    let childModal: AnyRecord | null = null
    let editorRequestId: string | null = null
    let disposeStage = () => {}
    const expandedPieces = new Set<string>()
    const sourceScrollBySwipe = new Map<number, { top: number; left: number }>()

    const renderStepper = (): HTMLElement => {
      const stepper = el('div', 'stitch-stepper')
      const labels = ['Select', 'Arrange', 'Edit']
      labels.forEach((label, index) => {
        const item = el('div', `stitch-step${session.step === index ? ' is-active' : ''}${session.step > index ? ' is-done' : ''}`)
        const dot = el('span', 'stitch-step-dot')
        dot.textContent = String(index + 1)
        item.setAttribute('aria-current', session.step === index ? 'step' : 'false')
        const text = el('span', 'stitch-step-label')
        text.textContent = label
        item.append(dot, text)
        stepper.appendChild(item)
      })
      return stepper
    }

    const previewPiece = (raw: string, label: string, resolved: boolean, opener: HTMLElement, sourceRef: { swipeIndex: number; start: number; end: number }) => {
      childModal?.dismiss()
      const previewModal = ctx.ui.showModal({ title: `Preview: ${label}`, width: 900, maxHeight: 100000 })
      childModal = previewModal
      const container = previewModal.root.parentElement?.parentElement as HTMLElement | null
      if (container) container.style.maxHeight = 'calc(var(--app-interactive-viewport-height, calc(100dvh - var(--app-interactive-safe-top, 0px))) - 24px)'
      if (container?.parentElement) {
        container.parentElement.style.top = 'var(--app-interactive-safe-top, 0px)'
        container.parentElement.style.height = 'auto'
      }
      const explanation = el('p', 'stitch-source-hint')
      explanation.textContent = resolved
        ? 'Stored source preview. Rendered display previews are unavailable on this host; output may differ from the chat.'
        : 'HTML preview. Scripts, external resources, and chat actions are disabled.'
      const details = el('details')
      const summary = el('summary')
      summary.textContent = 'Exact source'
      const source = el('pre', 'stitch-preview-source')
      source.textContent = raw
      details.append(summary, source)
      const close = textButton('Close preview')
      close.addEventListener('click', () => previewModal.dismiss())
      const nativeSupported = typeof ctx.components?.mountHostSurface === 'function'
        && ctx.components.listHostSurfaces?.().some((surface: AnyRecord) => surface.id === 'message_preview')
      if (nativeSupported) {
        const nativeView = el('div', 'stitch-preview-native')
        nativeView.setAttribute('role', 'region')
        nativeView.setAttribute('aria-label', `${label} display preview`)
        previewModal.root.append(explanation, nativeView, details, close)
        try {
          const handle = ctx.components.mountHostSurface(nativeView, 'message_preview', {
            chatId: session.chatId, messageId: session.messageId, ...sourceRef,
          })
          explanation.textContent = 'Read-only preview using the current message source and display settings.'
          previewModal.onDismiss(() => {
            handle.destroy()
            if (childModal === previewModal) childModal = null
            if (opener.isConnected) opener.focus()
          })
          close.focus()
          return
        } catch {
          nativeView.remove()
        }
      }
      const parsed = new DOMParser().parseFromString(raw, 'text/html')
      parsed.querySelectorAll('script, meta, base, link, iframe, frame, object, embed').forEach((node) => node.remove())
      parsed.querySelectorAll('a, area').forEach((node) => { node.removeAttribute('href'); node.removeAttribute('xlink:href') })
      parsed.querySelectorAll('input, button, select, textarea').forEach((node) => node.setAttribute('disabled', ''))
      const themeProbe = el('span')
      themeProbe.hidden = true
      themeProbe.style.backgroundColor = 'var(--lumiverse-bg-opaque, var(--lumiverse-bg, Canvas))'
      themeProbe.style.color = 'var(--lumiverse-text, CanvasText)'
      previewModal.root.appendChild(themeProbe)
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
      const theme = () => {
        const hostScheme = getComputedStyle(previewModal.root).colorScheme
        themeProbe.style.colorScheme = hostScheme === 'normal' ? 'light dark' : hostScheme
        const colors = getComputedStyle(themeProbe)
        return { background: colors.backgroundColor, foreground: colors.color, scheme: hostScheme === 'normal' ? (systemTheme.matches ? 'dark' : 'light') : hostScheme }
      }
      const previewHtml = (colors: ReturnType<typeof theme>) => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{color-scheme:${colors.scheme}}html,body{background-color:${colors.background}!important;color:${colors.foreground}}body{font:14px/1.6 system-ui;padding:16px;overflow-wrap:anywhere;white-space:pre-wrap}img{max-width:100%}</style>${parsed.head.innerHTML}</head><body>${parsed.body.innerHTML}</body></html>`
      let previewTheme = theme()
      const createPreviewSandbox = (colors: ReturnType<typeof theme>) => {
        const handle = ctx.dom.createSandboxFrame({ html: previewHtml(colors), autoResize: false })
        const element = handle.element as HTMLIFrameElement
        element.classList.add('stitch-preview-frame')
        element.style.height = '55vh'
        element.style.background = colors.background
        element.title = `${label} HTML preview`
        // This visualizer is intentionally static, including the host bootstrap.
        element.setAttribute('sandbox', '')
        element.referrerPolicy = 'no-referrer'
        return handle
      }
      let sandbox = createPreviewSandbox(previewTheme)
      let frame = sandbox.element as HTMLIFrameElement
      const refreshTheme = () => {
        const next = theme()
        if (JSON.stringify(next) === JSON.stringify(previewTheme)) return
        previewTheme = next
        // Replacing the static frame avoids overlapping srcdoc navigations
        // painting stale theme colors in WebKit during rapid theme changes.
        const replacement = createPreviewSandbox(next)
        frame.replaceWith(replacement.element)
        sandbox.destroy()
        sandbox = replacement
        frame = replacement.element
      }
      const themeObserver = new MutationObserver(refreshTheme)
      for (let ancestor: HTMLElement | null = previewModal.root; ancestor; ancestor = ancestor.parentElement) {
        themeObserver.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
      }
      themeObserver.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true })
      systemTheme.addEventListener('change', refreshTheme)
      previewModal.root.append(explanation, frame, details, close)
      previewModal.onDismiss(() => {
        themeObserver.disconnect()
        systemTheme.removeEventListener('change', refreshTheme)
        sandbox.destroy()
        if (childModal === previewModal) childModal = null
        if (opener?.isConnected) opener.focus()
      })
      close.focus()
    }

    const renderNotice = (): HTMLElement => {
      const notice = el('div', `stitch-notice${session.notice.startsWith('Error:') ? ' is-error' : ''}`)
      notice.textContent = session.notice.replace(/^Error:\s*/, '')
      return notice
    }

    const renderThread = (): HTMLElement => {
      const thread = el('div', 'stitch-thread')
      if (session.fragments.length === 0) {
        const empty = el('span', 'stitch-thread-empty')
        empty.textContent = 'Selected pieces will collect here.'
        thread.appendChild(empty)
        return thread
      }
      session.fragments.forEach((fragment) => {
        const chip = el('span', 'stitch-chip')
        const source = el('strong')
        source.textContent = `S${fragment.swipeIndex + 1}`
        const previewText = fragment.sourceKind === 'html-island'
          ? 'HTML island'
          : fragment.sourceKind === 'resolved-island'
            ? `${fragment.sourceLabel || 'Resolved'} island`
            : shortPreview(fragment.text, 86)
        chip.append(source, document.createTextNode(previewText))
        thread.appendChild(chip)
      })
      return thread
    }

    const currentFragments = () => session.fragments
      .filter((fragment) => fragment.swipeIndex === session.currentSwipe)
      .slice()
      .sort((a, b) => a.start - b.start)

    const exactFragmentForBlock = (block: SelectableSourceBlock): StitchFragment | null => (
      currentFragments().find((fragment) => fragment.start === block.start && fragment.end === block.end) ?? null
    )

    const overlappingFragmentsForBlock = (block: SelectableSourceBlock): StitchFragment[] => (
      currentFragments().filter((fragment) => fragment.start < block.end && fragment.end > block.start)
    )

    const appendParagraphText = (
      node: HTMLElement,
      raw: string,
      block: SelectableSourceBlock,
      fragments: readonly StitchFragment[],
    ) => {
      let cursor = block.start
      const overlaps = fragments
        .filter((fragment) => fragment.start < block.end && fragment.end > block.start)
        .sort((a, b) => a.start - b.start)
      for (const fragment of overlaps) {
        const start = Math.max(block.start, fragment.start)
        const end = Math.min(block.end, fragment.end)
        if (start > cursor) node.append(document.createTextNode(raw.slice(cursor, start)))
        const mark = document.createElement('mark')
        mark.textContent = raw.slice(start, end)
        mark.title = 'Already added to Stitch'
        node.appendChild(mark)
        cursor = Math.max(cursor, end)
      }
      if (cursor < block.end) node.append(document.createTextNode(raw.slice(cursor, block.end)))
    }

    const renderSourceContents = (source: HTMLElement) => {
      const raw = session.swipes[session.currentSwipe] ?? ''
      const fragments = currentFragments()
      const blocks = findSelectableSourceBlocks(raw)

      for (const [blockIndex, block] of blocks.entries()) {
        const exact = fragments.find((fragment) => fragment.start === block.start && fragment.end === block.end) ?? null
        const overlapping = fragments.some((fragment) => fragment.start < block.end && fragment.end > block.start)

        if (block.kind === 'paragraph') {
          const paragraph = el('p', `stitch-source-block${exact ? ' is-selected' : overlapping ? ' is-partial' : ''}`)
          paragraph.dataset.stitchSourceStart = String(block.start)
          paragraph.dataset.stitchSourceEnd = String(block.end)
          paragraph.dataset.stitchSourceKind = block.kind
          paragraph.tabIndex = 0
          paragraph.setAttribute('role', 'button')
          paragraph.setAttribute('aria-pressed', exact ? 'true' : 'false')
          paragraph.title = exact ? 'Click to remove this paragraph from Stitch' : 'Click to add this paragraph to Stitch'
          appendParagraphText(paragraph, raw, block, fragments)

          const toggleParagraph = () => {
            const selection = window.getSelection()
            if (selection && !selection.isCollapsed && source.contains(selection.anchorNode)) return
            const selected = exactFragmentForBlock(block)
            if (selected) {
              session.fragments = session.fragments.filter((fragment) => fragment.id !== selected.id)
              session.notice = `Removed piece from Swipe ${session.currentSwipe + 1}.`
              pendingSelection = null
              render()
              return
            }
            if (overlappingFragmentsForBlock(block).length > 0) {
              session.notice = 'Error: Part of this paragraph is already selected. Remove that smaller piece first.'
              renderNoticeOnly()
              return
            }
            addRange(block.start, block.end, block)
          }
          paragraph.addEventListener('click', toggleParagraph)
          paragraph.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            toggleParagraph()
          })
          source.appendChild(paragraph)
          continue
        }

        const row = el('div', 'stitch-island-row')
        const island = el('button', `stitch-source-island${exact ? ' is-selected' : ''}`)
        island.type = 'button'
        island.dataset.stitchSourceStart = String(block.start)
        island.dataset.stitchSourceEnd = String(block.end)
        island.dataset.stitchSourceKind = block.kind
        island.tabIndex = 0
        island.setAttribute('aria-pressed', exact ? 'true' : 'false')
        const label = el('span', 'stitch-source-island-label')
        label.textContent = block.kind === 'html-island'
          ? 'HTML island'
          : `${block.label || 'Resolved'} island`
        const preview = el('span', 'stitch-source-island-preview')
        preview.textContent = islandPreview(raw.slice(block.start, block.end), block)
        island.append(label, preview)

        const toggleIsland = () => {
          const selected = exactFragmentForBlock(block)
          if (selected) {
            session.fragments = session.fragments.filter((fragment) => fragment.id !== selected.id)
            session.notice = `Removed island from Swipe ${session.currentSwipe + 1}.`
            render()
            return
          }
          if (overlappingFragmentsForBlock(block).length > 0) {
            session.notice = 'Error: Part of this island is already selected. Remove the overlapping piece first.'
            renderNoticeOnly()
            return
          }
          addRange(block.start, block.end, block)
        }
        island.addEventListener('click', toggleIsland)
        const view = iconButton(`Preview ${label.textContent} ${blockIndex + 1} from Swipe ${session.currentSwipe + 1}`, eyeIcon())
        view.addEventListener('click', () => previewPiece(raw.slice(block.start, block.end), label.textContent!, block.kind === 'resolved-island', view, { swipeIndex: session.currentSwipe, start: block.start, end: block.end }))
        row.append(island, view)
        source.appendChild(row)
      }
    }

    const addRange = (start: number, end: number, sourceBlock?: SelectableSourceBlock) => {
      const raw = session.swipes[session.currentSwipe] ?? ''
      const safeStart = Math.max(0, Math.min(raw.length, start))
      const safeEnd = Math.max(safeStart, Math.min(raw.length, end))
      if (safeEnd <= safeStart || !raw.slice(safeStart, safeEnd).trim()) {
        session.notice = 'Error: Select some text first.'
        render()
        return
      }
      if (overlapsExisting(session.fragments, session.currentSwipe, safeStart, safeEnd)) {
        session.notice = 'Error: That selection overlaps a piece you already added from this swipe.'
        render()
        return
      }
      session.fragments.push({
        id: uniqueId(),
        swipeIndex: session.currentSwipe,
        start: safeStart,
        end: safeEnd,
        text: raw.slice(safeStart, safeEnd),
        sourceKind: sourceBlock?.kind,
        sourceLabel: sourceBlock?.label,
      })
      session.notice = `Added piece from Swipe ${session.currentSwipe + 1}.`
      pendingSelection = null
      window.getSelection()?.removeAllRanges()
      render()
    }

    const stageHeader = (kicker: string, title: string): HTMLElement => {
      const head = el('div', 'stitch-stage-head')
      const copy = el('div', 'stitch-stage-copy')
      const k = el('div', 'stitch-kicker')
      k.textContent = kicker
      const t = el('div', 'stitch-stage-title')
      t.textContent = title
      copy.append(k, t)
      head.appendChild(copy)
      return head
    }

    const renderSelect = (stage: HTMLElement) => {
      const head = stageHeader(`Swipe ${session.currentSwipe + 1} of ${session.swipes.length}`, 'Select the parts worth keeping')
      const nav = el('div', 'stitch-nav')
      const previous = iconButton('Previous swipe', chevronIcon('left'))
      previous.disabled = session.currentSwipe <= 0
      previous.addEventListener('click', () => {
        session.currentSwipe -= 1
        session.notice = ''
        pendingSelection = null
        render()
      })
      const next = iconButton('Next swipe', chevronIcon('right'))
      next.disabled = session.currentSwipe >= session.swipes.length - 1
      next.addEventListener('click', () => {
        session.currentSwipe += 1
        session.notice = ''
        pendingSelection = null
        render()
      })
      nav.append(previous, next)
      head.appendChild(nav)

      const sourceWrap = el('div', 'stitch-source-wrap')
      sourceWrap.dataset.stitchSwipeIndex = String(session.currentSwipe)
      const source = el('div', 'stitch-source')
      source.tabIndex = 0
      source.setAttribute('role', 'region')
      source.setAttribute('aria-label', `Swipe ${session.currentSwipe + 1} selectable source`)
      renderSourceContents(source)
      sourceWrap.appendChild(source)

      const toolbar = el('div', 'stitch-source-toolbar')
      const sourceActions = el('div', 'stitch-source-actions')
      const addSelection = textButton('Add selection', { icon: plusIcon() })
      addSelection.disabled = true
      const hint = el('span', 'stitch-source-hint')
      hint.textContent = 'Click a paragraph or island to toggle it · highlight within one paragraph for a smaller slice'

      const captureSelection = () => {
        if (!source.isConnected) return
        const range = selectionOffsets(source)
        // Keep the captured range when focus moves to Add selection. A new
        // collapsed selection inside the source still clears stale offsets.
        if (!range && !source.contains(window.getSelection()?.anchorNode ?? null)) return
        pendingSelection = range
        addSelection.disabled = !range || range.end <= range.start
      }
      document.addEventListener('selectionchange', captureSelection)
      disposeStage = () => document.removeEventListener('selectionchange', captureSelection)
      source.addEventListener('mouseup', captureSelection)
      source.addEventListener('keyup', captureSelection)
      source.addEventListener('touchend', () => setTimeout(captureSelection, 0))
      addSelection.addEventListener('pointerdown', (event) => event.preventDefault())
      addSelection.addEventListener('click', () => {
        if (pendingSelection) addRange(pendingSelection.start, pendingSelection.end)
      })
      sourceActions.append(addSelection, hint)

      const count = el('span', 'stitch-count')
      count.textContent = `${session.fragments.length} piece${session.fragments.length === 1 ? '' : 's'} selected`
      toolbar.append(sourceActions, count)

      stage.append(head, sourceWrap, toolbar, renderThread())
    }

    const renderArrange = (stage: HTMLElement) => {
      const head = stageHeader('Arrange', 'Drag the pieces into the final order')
      const count = el('span', 'stitch-count')
      count.textContent = `${session.fragments.length} piece${session.fragments.length === 1 ? '' : 's'}`
      const tools = el('div', 'stitch-arrange-tools')
      const expandAll = textButton('Expand all')
      expandAll.classList.add('stitch-read-more')
      tools.append(count, expandAll)
      head.appendChild(tools)

      const list = el('div', 'stitch-arrange-list')
      list.id = uniqueId()
      expandAll.setAttribute('aria-controls', list.id)
      const expansionUpdates: Array<() => void> = []
      const allExpanded = () => session.fragments.every((fragment) => expandedPieces.has(fragment.id))
      const syncAllAction = () => { expandAll.textContent = allExpanded() ? 'Collapse all' : 'Expand all' }
      expandAll.addEventListener('click', () => {
        const collapse = allExpanded()
        session.fragments.forEach((fragment) => {
          if (collapse) expandedPieces.delete(fragment.id)
          else expandedPieces.add(fragment.id)
        })
        expansionUpdates.forEach((update) => update())
        syncAllAction()
      })
      const previewObserver = new ResizeObserver((entries) => {
        for (const { target } of entries) {
          target.classList.toggle('is-truncated', !target.classList.contains('is-expanded') && target.scrollHeight > target.clientHeight + 1)
        }
      })
      list.setAttribute('role', 'list')
      list.setAttribute('aria-label', 'Arranged pieces')
      let touchDrag: { id: string; pointerId: number; y: number; target: HTMLElement | null } | null = null
      let scrollFrame = 0
      const updateTarget = () => {
        if (!touchDrag) return
        list.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'))
        const cards = [...list.querySelectorAll<HTMLElement>('.stitch-piece')]
        const bounds = list.getBoundingClientRect()
        const y = Math.max(bounds.top, Math.min(bounds.bottom, touchDrag.y))
        touchDrag.target = cards.reduce<HTMLElement | null>((nearest, card) => {
          const rect = card.getBoundingClientRect()
          const distance = Math.abs(y - (rect.top + rect.bottom) / 2)
          if (!nearest) return card
          const other = nearest.getBoundingClientRect()
          return distance < Math.abs(y - (other.top + other.bottom) / 2) ? card : nearest
        }, null)
        if (touchDrag.target?.dataset.fragmentId !== touchDrag.id) touchDrag.target?.classList.add('is-drop-target')
      }
      const autoScroll = () => {
        if (!touchDrag) return
        const rect = list.getBoundingClientRect()
        const edge = Math.min(56, rect.height / 4)
        const delta = touchDrag.y < rect.top + edge ? -10 : touchDrag.y > rect.bottom - edge ? 10 : 0
        if (delta) { list.scrollTop += delta; updateTarget() }
        scrollFrame = requestAnimationFrame(autoScroll)
      }
      const clearTouchDrag = () => {
        touchDrag = null
        cancelAnimationFrame(scrollFrame)
        list.querySelectorAll('.is-dragging, .is-drop-target').forEach((node) => node.classList.remove('is-dragging', 'is-drop-target'))
      }
      disposeStage = () => { clearTouchDrag(); previewObserver.disconnect() }
      const movePiece = (from: number, to: number) => {
        const id = session.fragments[from]?.id
        const scrollTop = list.scrollTop
        session.fragments = moveItem(session.fragments, from, to)
        render()
        const nextList = modal.root.querySelector('.stitch-arrange-list')
        if (nextList) nextList.scrollTop = scrollTop
        ;(modal.root.querySelector(`[data-fragment-id="${id}"] .stitch-drag-handle`) as HTMLElement | null)?.focus({ preventScroll: true })
      }
      session.fragments.forEach((fragment, index) => {
        const card = el('div', 'stitch-piece')
        card.draggable = true
        card.dataset.fragmentId = fragment.id
        card.setAttribute('role', 'listitem')

        const handle = iconButton(`Reorder piece ${index + 1}; use arrow keys to move`, gripIcon())
        handle.classList.add('stitch-drag-handle')
        handle.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          movePiece(index, Math.max(0, Math.min(session.fragments.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1))))
        })
        handle.addEventListener('pointerdown', (event) => {
          if (event.pointerType === 'mouse' || event.button !== 0) return
          event.preventDefault()
          handle.setPointerCapture(event.pointerId)
          touchDrag = { id: fragment.id, pointerId: event.pointerId, y: event.clientY, target: card }
          card.classList.add('is-dragging')
          scrollFrame = requestAnimationFrame(autoScroll)
        })
        handle.addEventListener('pointermove', (event) => {
          if (touchDrag?.pointerId !== event.pointerId) return
          touchDrag.y = event.clientY
          updateTarget()
        })
        handle.addEventListener('pointerup', (event) => {
          if (touchDrag?.pointerId !== event.pointerId) return
          const targetId = touchDrag.target?.dataset.fragmentId
          clearTouchDrag()
          const to = session.fragments.findIndex((candidate) => candidate.id === targetId)
          if (to >= 0 && to !== index) movePiece(index, to)
        })
        handle.addEventListener('pointercancel', clearTouchDrag)
        handle.addEventListener('lostpointercapture', clearTouchDrag)
        const copy = el('div', 'stitch-piece-copy')
        const meta = el('div', 'stitch-piece-meta')
        meta.textContent = `Swipe ${fragment.swipeIndex + 1} · Piece ${index + 1}`
        const preview = el('div', `stitch-piece-preview${expandedPieces.has(fragment.id) ? ' is-expanded' : ''}`)
        preview.id = `stitch-preview-${fragment.id}`
        const collapsedText = fragment.sourceKind === 'html-island'
          ? 'Styled HTML island (source preserved exactly)'
          : fragment.sourceKind === 'resolved-island'
            ? `${fragment.sourceLabel || 'Resolved'} island (source preserved exactly)`
            : fragment.text
        preview.textContent = expandedPieces.has(fragment.id) ? fragment.text : collapsedText
        previewObserver.observe(preview)
        copy.append(meta, preview)

        const actions = el('div', 'stitch-piece-actions')
        const expand = textButton(expandedPieces.has(fragment.id) ? 'Show less' : 'Read more')
        expand.classList.add('stitch-read-more')
        expand.setAttribute('aria-label', `${expandedPieces.has(fragment.id) ? 'Show less of' : 'Read more of'} piece ${index + 1}`)
        expand.setAttribute('aria-expanded', String(expandedPieces.has(fragment.id)))
        expand.setAttribute('aria-controls', preview.id)
        const updateExpansion = () => {
          preview.classList.toggle('is-expanded', expandedPieces.has(fragment.id))
          if (expandedPieces.has(fragment.id)) preview.classList.remove('is-truncated')
          preview.textContent = expandedPieces.has(fragment.id) ? fragment.text : collapsedText
          expand.textContent = expandedPieces.has(fragment.id) ? 'Show less' : 'Read more'
          expand.setAttribute('aria-expanded', String(expandedPieces.has(fragment.id)))
          expand.setAttribute('aria-label', `${expandedPieces.has(fragment.id) ? 'Show less of' : 'Read more of'} piece ${index + 1}`)
        }
        expansionUpdates.push(updateExpansion)
        expand.addEventListener('click', () => {
          if (expandedPieces.has(fragment.id)) expandedPieces.delete(fragment.id)
          else expandedPieces.add(fragment.id)
          updateExpansion()
          syncAllAction()
        })
        const view = iconButton(`Preview piece ${index + 1}`, eyeIcon())
        view.addEventListener('click', () => previewPiece(fragment.text, `Piece ${index + 1}`, fragment.sourceKind === 'resolved-island', view, { swipeIndex: fragment.swipeIndex, start: fragment.start, end: fragment.end }))
        const up = iconButton(`Move piece ${index + 1} up`, chevronIcon('up'))
        up.disabled = index === 0
        up.addEventListener('click', () => {
          movePiece(index, index - 1)
        })
        const down = iconButton(`Move piece ${index + 1} down`, chevronIcon('down'))
        down.disabled = index === session.fragments.length - 1
        down.addEventListener('click', () => {
          movePiece(index, index + 1)
        })
        const remove = iconButton(`Remove piece ${index + 1}`, trashIcon())
        remove.addEventListener('click', () => {
          session.fragments = session.fragments.filter((candidate) => candidate.id !== fragment.id)
          if (session.fragments.length === 0) session.step = 0
          render()
        })
        copy.appendChild(expand)
        if (fragment.sourceKind === 'html-island' || fragment.sourceKind === 'resolved-island') actions.append(view)
        actions.append(up, down, remove)

        card.addEventListener('dragstart', (event) => {
          if ((event.target as Element).closest('button:not(.stitch-drag-handle)')) { event.preventDefault(); return }
          draggingId = fragment.id
          card.classList.add('is-dragging')
          event.dataTransfer?.setData('text/plain', fragment.id)
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
        })
        card.addEventListener('dragend', () => {
          draggingId = null
          card.classList.remove('is-dragging')
          list.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'))
        })
        card.addEventListener('dragover', (event) => {
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
          card.classList.add('is-drop-target')
        })
        card.addEventListener('dragleave', () => card.classList.remove('is-drop-target'))
        card.addEventListener('drop', (event) => {
          event.preventDefault()
          const sourceId = draggingId || event.dataTransfer?.getData('text/plain')
          if (!sourceId || sourceId === fragment.id) return
          const from = session.fragments.findIndex((candidate) => candidate.id === sourceId)
          const to = session.fragments.findIndex((candidate) => candidate.id === fragment.id)
          if (from < 0 || to < 0) return
          movePiece(from, to)
        })

        card.append(handle, copy, actions)
        list.appendChild(card)
      })

      syncAllAction()
      stage.append(head, list)
    }

    const renderEdit = (stage: HTMLElement) => {
      const head = stageHeader('Edit', 'Make the stitched swipe read like one response')
      const meta = el('span', 'stitch-count')
      const sources = new Set(session.fragments.map((fragment) => fragment.swipeIndex + 1))
      meta.textContent = `${session.fragments.length} pieces · Swipes ${[...sources].join(', ')}`
      head.appendChild(meta)

      const editor = el('textarea', 'stitch-editor')
      editor.value = session.draft
      editor.spellcheck = true
      editor.setAttribute('aria-label', 'Editable stitched swipe')
      editor.addEventListener('input', () => {
        session.draft = editor.value
        session.draftDirty = true
        session.notice = ''
        const save = modal.root.querySelector('[data-stitch-save]') as HTMLButtonElement | null
        if (save) save.disabled = !session.draft.trim()
      })
      requestAnimationFrame(() => editor.focus())
      const expand = textButton('Open expanded editor')
      expand.addEventListener('click', async () => {
        expand.disabled = true
        editor.readOnly = true
        const requestId = uniqueId()
        editorRequestId = requestId
        try {
          const result = await rpc('stitch_edit', { value: session.draft, editorRequestId: requestId }, 60 * 60 * 1000)
          if (activeSession !== session || editorRequestId !== requestId) return
          if (!result.cancelled) {
            session.draft = result.text
            session.draftDirty = true
            editor.value = session.draft
            session.notice = ''
            const save = modal.root.querySelector('[data-stitch-save]') as HTMLButtonElement | null
            if (save) save.disabled = !session.draft.trim()
          }
        } catch (error) {
          if (activeSession === session) {
            session.notice = `Error: ${error instanceof Error ? error.message : String(error)}`
            renderNoticeOnly()
          }
        } finally {
          if (editorRequestId === requestId) editorRequestId = null
          editor.readOnly = false
          expand.disabled = false
          if (editor.isConnected) editor.focus()
        }
      })
      stage.append(head, expand, editor)
    }

    const renderFooter = (): HTMLElement => {
      const footer = el('div', 'stitch-footer')
      const left = el('div', 'stitch-footer-actions')
      const right = el('div', 'stitch-footer-actions')

      if (session.step > 0) {
        const back = textButton(session.step === 1 ? 'Back to Select' : 'Back to Arrange')
        back.addEventListener('click', () => {
          session.step = (session.step - 1) as 0 | 1
          session.notice = session.draftDirty && session.step === 1
            ? 'Your edits are still kept. Continuing to Edit again will rebuild from the arranged pieces.'
            : ''
          render()
        })
        left.appendChild(back)
      }

      if (session.step === 0) {
        const next = textButton('Arrange pieces', { primary: true })
        next.disabled = session.fragments.length === 0
        next.addEventListener('click', () => {
          session.step = 1
          session.notice = ''
          render()
        })
        right.appendChild(next)
      } else if (session.step === 1) {
        const next = textButton('Edit stitch', { primary: true })
        next.disabled = session.fragments.length === 0
        next.addEventListener('click', async () => {
          if (session.draftDirty) {
            const result = await ctx.ui.showConfirm({
              title: 'Rebuild edit draft?',
              message: 'Your freeform edits are still preserved right now. Rebuilding will replace them with the current arranged piece order.',
              variant: 'warning',
              confirmLabel: 'Rebuild',
              cancelLabel: 'Keep edits',
            })
            if (!result.confirmed) return
          }
          session.draft = composeFragments(session.fragments)
          session.draftDirty = false
          session.step = 2
          session.notice = ''
          render()
        })
        right.appendChild(next)
      } else {
        const save = textButton('Save stitched swipe', { primary: true, icon: stitchIcon() })
        save.dataset.stitchSave = ''
        save.disabled = !session.draft.trim()
        save.addEventListener('click', async () => {
          save.disabled = true
          save.setAttribute('aria-busy', 'true')
          session.notice = 'Saving as a new swipe…'
          renderNoticeOnly()
          try {
            await rpc('stitch_save', {
              chatId: session.chatId,
              messageId: session.messageId,
              revision: session.revision,
              content: session.draft,
            })
            activeModal?.dismiss?.()
          } catch (error) {
            session.notice = `Error: ${error instanceof Error ? error.message : String(error)}`
            save.disabled = false
            save.removeAttribute('aria-busy')
            render()
          }
        })
        right.appendChild(save)
      }
      footer.append(left, right)
      return footer
    }

    const renderNoticeOnly = () => {
      const existing = modal.root.querySelector('.stitch-notice')
      if (!existing) return
      existing.className = `stitch-notice${session.notice.startsWith('Error:') ? ' is-error' : ''}`
      existing.textContent = session.notice.replace(/^Error:\s*/, '')
    }

    const render = () => {
      disposeStage()
      disposeStage = () => {}
      const focused = modal.root.contains(document.activeElement) ? document.activeElement as HTMLElement : null
      const focusedSource = focused?.dataset.stitchSourceStart
      const focusedLabel = focused?.getAttribute('aria-label')
      // Selection toggles rebuild the stage. Preserve both the source pane and
      // modal-body scroll positions so a click never punts the reader to the top.
      const previousSourceWrap = modal.root.querySelector('.stitch-source-wrap[data-stitch-swipe-index]') as HTMLElement | null
      if (previousSourceWrap) {
        const previousSwipe = Number(previousSourceWrap.dataset.stitchSwipeIndex)
        if (Number.isInteger(previousSwipe)) {
          sourceScrollBySwipe.set(previousSwipe, {
            top: previousSourceWrap.scrollTop,
            left: previousSourceWrap.scrollLeft,
          })
        }
      }
      const scrollBody = modal.root.parentElement instanceof HTMLElement ? modal.root.parentElement : null
      const modalBodyScrollTop = scrollBody?.scrollTop ?? 0
      const modalBodyScrollLeft = scrollBody?.scrollLeft ?? 0

      const shell = el('div', 'stitch-shell')
      shell.appendChild(renderStepper())
      const stage = el('div', 'stitch-stage')
      if (session.step === 0) renderSelect(stage)
      else if (session.step === 1) renderArrange(stage)
      else renderEdit(stage)
      shell.append(stage, renderNotice(), renderFooter())
      modal.root.replaceChildren(shell)
      if (focused) {
        const replacement = focusedSource !== undefined
          ? modal.root.querySelector(`[data-stitch-source-start="${focusedSource}"]`)
          : focusedLabel ? [...modal.root.querySelectorAll('[aria-label]')].find((node: any) => node.getAttribute('aria-label') === focusedLabel) : null
        const target = replacement ?? modal.root.querySelector('.stitch-stage-title')
        if (target) {
          if (!replacement) target.tabIndex = -1
          target.focus({ preventScroll: true })
        }
      }

      const nextSourceWrap = modal.root.querySelector('.stitch-source-wrap[data-stitch-swipe-index]') as HTMLElement | null
      const savedSourceScroll = sourceScrollBySwipe.get(session.currentSwipe)
      if (nextSourceWrap && savedSourceScroll) {
        nextSourceWrap.scrollTop = savedSourceScroll.top
        nextSourceWrap.scrollLeft = savedSourceScroll.left
      }
      if (scrollBody) {
        scrollBody.scrollTop = modalBodyScrollTop
        scrollBody.scrollLeft = modalBodyScrollLeft
      }
    }

    modal.onDismiss(() => {
      disposeStage()
      childModal?.dismiss()
      if (editorRequestId) ctx.sendToBackend({ type: 'stitch_edit_close', editorRequestId })
      editorRequestId = null
      if (activeModal === modal) activeModal = null
      if (activeSession === session) activeSession = null
    })

    render()
  }

  const openStitch = async (messageId: string) => {
    const active = ctx.state.get('chat.active') as { chatId?: string | null }
    const chatId = active?.chatId
    if (!chatId) return
    setBusyForMessage(messageId, true)
    try {
      const result = await rpc('stitch_open', { chatId, messageId }) as StitchOpenResult
      showEditor(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await ctx.ui.showConfirm({
        title: 'Stitch couldn’t open',
        message,
        variant: 'warning',
        confirmLabel: 'Okay',
        cancelLabel: 'Close',
      })
    } finally {
      setBusyForMessage(messageId, false)
    }
  }

  const registerDecorator = ctx.ui.registerDomDecorator
  if (typeof registerDecorator !== 'function') {
    console.warn('[Stitch] This Lumiverse build does not expose repeated message decorators.')
    removeStyle()
    unsubBackend()
    return
  }

  const disposeActionDecorator = registerDecorator({
    mount: 'message_actions',
    priority: 50,
    render(root: HTMLElement, info: AnyRecord) {
      root.style.display = 'contents'
      const messageId = messageIdFromActionScope(info.scope)
      if (!messageId) return
      const button = document.createElement('button')
      button.className = 'stitch-trigger-action'
      button.type = 'button'
      button.title = 'Stitch swipes'
      button.setAttribute('aria-label', 'Stitch swipes')
      button.appendChild(stitchIcon())
      button.addEventListener('click', () => void openStitch(messageId))
      root.appendChild(button)
      const untrack = trackButton(actionButtons, messageId, button)
      refreshMessageButton(messageId)
      return () => {
        untrack()
        button.remove()
      }
    },
    update(root: HTMLElement, info: AnyRecord) {
      const messageId = messageIdFromActionScope(info.scope)
      if (messageId) refreshMessageButton(messageId)
      root.style.display = 'contents'
    },
  })

  const disposeMinimalDecorator = registerDecorator({
    mount: 'message_footer',
    priority: 50,
    render(root: HTMLElement, info: AnyRecord) {
      const messageId = messageIdFromMinimalFooterScope(info.scope)
      if (!messageId) {
        root.style.display = 'contents'
        return
      }
      root.style.display = 'flex'
      root.style.justifyContent = 'flex-end'
      const button = el('button', 'stitch-trigger-minimal')
      button.type = 'button'
      button.title = 'Stitch swipes'
      button.setAttribute('aria-label', 'Stitch swipes')
      button.append(stitchIcon(), document.createTextNode('Stitch'))
      button.addEventListener('click', () => void openStitch(messageId))
      root.appendChild(button)
      const untrack = trackButton(minimalButtons, messageId, button)
      refreshMessageButton(messageId)
      return () => {
        untrack()
        button.remove()
      }
    },
    update(_root: HTMLElement, info: AnyRecord) {
      const messageId = messageIdFromMinimalFooterScope(info.scope)
      if (messageId) refreshMessageButton(messageId)
    },
  })

  const eventUnsubs = [
    ctx.events.on('MESSAGE_SWIPED', () => setTimeout(refreshAllButtons, 0)),
    ctx.events.on('SWIPE_EDITED', () => setTimeout(refreshAllButtons, 0)),
    ctx.events.on('MESSAGE_EDITED', () => setTimeout(refreshAllButtons, 0)),
  ]

  const unsubActiveChat = ctx.state.subscribe('chat.active', (next: { chatId?: string | null }) => {
    if (activeSession && next?.chatId !== activeSession.chatId) activeModal?.dismiss?.()
    setTimeout(refreshAllButtons, 0)
  })

  refreshAllButtons()

  return () => {
    activeModal?.dismiss?.()
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout)
      waiter.reject(new Error('Stitch unloaded.'))
    }
    pending.clear()
    disposeActionDecorator()
    disposeMinimalDecorator()
    unsubBackend()
    unsubActiveChat()
    eventUnsubs.forEach((unsubscribe) => unsubscribe())
    removeStyle()
  }
}
