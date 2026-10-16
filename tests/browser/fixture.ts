import { setup } from '../../src/frontend'

// Controlled Spindle boundaries: no live accounts, chats, settings or saves.
const swipes = [
  'Alpha paragraph with a smaller slice and Unicode 🌙. '.repeat(6) + '\n\nBravo paragraph.\n\nCharlie paragraph.\n\n<div><style>h2{color:purple}</style><h2>Island preview</h2><script>parent.postMessage("unsafe", "*")</script></div>\n\n<!-- CARD_START -->{"mode":"card"}<!-- CARD_END -->',
  'Second swipe paragraph.',
]
let receive: (payload: any) => void = () => {}
let subscription: (state: any) => void = () => {}
let active = { chatId: 'fixture-chat' as string | null }
const dialogs = new Set<{ dismiss: () => void }>()
const requests: any[] = []
const modal = (options: any) => {
  const backdrop = document.createElement('div')
  backdrop.className = 'fixture-backdrop'
  const container = document.createElement('section')
  container.className = 'fixture-modal'
  container.setAttribute('role', 'dialog')
  container.setAttribute('aria-label', options.title)
  container.setAttribute('aria-modal', 'true')
  const heading = document.createElement('header')
  heading.textContent = options.title
  const body = document.createElement('div')
  body.className = 'fixture-body'
  const root = document.createElement('div')
  body.append(root)
  container.append(heading, body)
  backdrop.append(container)
  document.body.append(backdrop)
  const listeners: Array<() => void> = []
  const handle = {
    root,
    onDismiss(fn: () => void) { listeners.push(fn) },
    dismiss() {
      if (!backdrop.isConnected) return
      backdrop.remove()
      dialogs.delete(handle)
      document.removeEventListener('keydown', escape)
      listeners.forEach((fn) => fn())
    },
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && [...dialogs].at(-1) === handle) handle.dismiss()
  }
  document.addEventListener('keydown', escape)
  dialogs.add(handle)
  return handle
}
const ctx = {
  dom: {
    createSandboxFrame(options: any) {
      const element = document.createElement('iframe')
      element.setAttribute('sandbox', 'allow-scripts')
      element.srcdoc = options.html
      return { element, destroy() { element.remove() } }
    },
    addStyle(css: string) {
      const style = document.createElement('style')
      style.textContent = css
      document.head.append(style)
      return () => style.remove()
    },
  },
  messages: { getRecent: () => [{ id: 'fixture-message', role: 'assistant', index_in_chat: 1, swipes }] },
  state: {
    get: () => active,
    subscribe(_key: string, fn: typeof subscription) { subscription = fn; return () => { subscription = () => {} } },
  },
  events: { on: () => () => {} },
  onBackendMessage(fn: typeof receive) { receive = fn; return () => { receive = () => {} } },
  sendToBackend(payload: any) {
    requests.push(payload)
    if (payload.type === 'stitch_open') queueMicrotask(() => receive({ type: 'stitch_open_result', ...payload, swipes, activeSwipe: 0, revision: 'fixture' }))
    if (payload.type === 'stitch_edit') {
      const host = modal({ title: 'Native editor contract fixture' })
      const input = document.createElement('textarea')
      input.setAttribute('aria-label', 'Native editor text')
      input.value = payload.value
      const accept = document.createElement('button')
      accept.textContent = 'Apply native edits'
      let applied = false
      accept.onclick = () => { applied = true; host.dismiss() }
      host.root.append(input, accept)
      host.onDismiss(() => receive({ type: 'stitch_edit_result', requestId: payload.requestId, cancelled: !applied, text: applied ? input.value : payload.value }))
    }
    if (payload.type === 'stitch_edit_close') [...dialogs].at(-1)?.dismiss()
  },
  ui: {
    showModal: modal,
    showConfirm: async () => ({ confirmed: true }),
    registerDomDecorator(options: any) {
      if (options.mount !== 'message_actions') return () => {}
      const root = document.createElement('div')
      document.querySelector('#mount')!.append(root)
      const off = options.render(root, { scope: 'message:fixture-message:actions' })
      return () => { off?.(); root.remove() }
    },
  },
}
let dispose = setup(ctx)
Object.assign(window, {
  fixture: {
    requests, swipes,
    unload() { dispose?.() },
    remount() { dispose?.(); active = { chatId: 'fixture-chat' }; dispose = setup(ctx) },
    navigate() { active = { chatId: null }; subscription(active) },
  },
})
