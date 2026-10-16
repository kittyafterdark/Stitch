import { describe, expect, test } from 'bun:test'

describe('Stitch backend save contract', () => {
  test('appends + activates, then refuses a stale save', async () => {
    const responses: any[] = []
    let handler: ((payload: any, userId: string, frontendSessionId?: string) => Promise<void>) | undefined
    let updateCalls = 0
    const editorCalls: any[] = []
    let settleEditor: (result: any) => void = () => {}
    const messages = [{
      id: 'm1',
      role: 'assistant',
      content: 'Second',
      swipe_id: 1,
      swipes: ['First', 'Second'],
      swipe_dates: [1, 2],
    }]

    ;(globalThis as any).spindle = {
      onFrontendMessage(fn: typeof handler) {
        handler = fn
        return () => {}
      },
      sendToFrontend(payload: any, userId: string, options?: any) {
        responses.push({ payload, userId, options })
      },
      chat: {
        async getMessages() {
          return structuredClone(messages)
        },
        async updateMessage(_chatId: string, messageId: string, patch: any) {
          updateCalls += 1
          const message = messages.find((candidate) => candidate.id === messageId)!
          message.swipes = [...patch.swipes]
          message.swipe_id = patch.swipe_id
          message.content = message.swipes[message.swipe_id]
          while (message.swipe_dates.length < message.swipes.length) message.swipe_dates.push(3)
        },
      },
      textEditor: {
        open(options: any) {
          editorCalls.push(options)
          return new Promise((resolve) => { settleEditor = resolve })
        },
        async close(id: string, userId: string) {
          editorCalls.push({ close: id, userId })
          settleEditor({ text: 'Original draft', cancelled: true })
        },
      },
    }

    await import(`../src/backend.ts?test=${Date.now()}`)
    expect(handler).toBeDefined()

    const editing = handler!({ type: 'stitch_edit', requestId: 'edit-1', editorRequestId: 'editor-1', value: 'Original draft' }, 'u1', 'session-1')
    expect(editorCalls[0]).toEqual({ title: 'Edit stitched swipe', value: 'Original draft', editorRequestId: 'editor-1', userId: 'u1' })
    await handler!({ type: 'stitch_edit_close', editorRequestId: 'editor-1' }, 'u1', 'other-session')
    expect(editorCalls.length).toBe(1)
    settleEditor({ text: 'Expanded edits', cancelled: false })
    await editing
    expect(responses.at(-1)).toEqual({ payload: { type: 'stitch_edit_result', requestId: 'edit-1', text: 'Expanded edits', cancelled: false }, userId: 'u1', options: { frontendSessionId: 'session-1' } })
    const cancelling = handler!({ type: 'stitch_edit', requestId: 'edit-2', editorRequestId: 'editor-2', value: 'Original draft' }, 'u1', 'session-1')
    await handler!({ type: 'stitch_edit_close', editorRequestId: 'editor-2' }, 'u1', 'session-1')
    await cancelling
    expect(responses.at(-1).payload.cancelled).toBe(true)
    expect(updateCalls).toBe(0)

    await handler!({ type: 'stitch_open', requestId: 'open-1', chatId: 'c1', messageId: 'm1' }, 'u1', 'session-1')
    const opened = responses.at(-1).payload
    expect(opened.type).toBe('stitch_open_result')

    await handler!({
      type: 'stitch_save',
      requestId: 'save-1',
      chatId: 'c1',
      messageId: 'm1',
      revision: opened.revision,
      content: 'Master swipe',
    }, 'u1', 'session-1')

    expect(updateCalls).toBe(1)
    expect(messages[0].swipes).toEqual(['First', 'Second', 'Master swipe'])
    expect(messages[0].swipe_id).toBe(2)

    await handler!({ type: 'stitch_open', requestId: 'open-2', chatId: 'c1', messageId: 'm1' }, 'u1', 'session-1')
    const reopened = responses.at(-1).payload
    messages[0].swipes[0] = 'Changed elsewhere'

    await handler!({
      type: 'stitch_save',
      requestId: 'save-2',
      chatId: 'c1',
      messageId: 'm1',
      revision: reopened.revision,
      content: 'Do not write',
    }, 'u1', 'session-1')

    expect(responses.at(-1).payload.type).toBe('stitch_conflict')
    expect(updateCalls).toBe(1)
  })
})
