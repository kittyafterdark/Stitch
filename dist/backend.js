// @bun
// src/backend.ts
var encoder = new TextEncoder;
var editors = new Map;
async function fingerprint(message) {
  const payload = JSON.stringify({
    swipes: message.swipes,
    swipe_dates: message.swipe_dates
  });
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function send(payload, userId, frontendSessionId) {
  if (frontendSessionId) {
    spindle.sendToFrontend(payload, userId, { frontendSessionId });
    return;
  }
  spindle.sendToFrontend(payload, userId);
}
function fail(requestId, error, userId, frontendSessionId) {
  const message = error instanceof Error ? error.message : String(error);
  send({ type: "stitch_error", requestId, error: message }, userId, frontendSessionId);
}
async function getMessage(chatId, messageId) {
  const messages = await spindle.chat.getMessages(chatId);
  const message = messages.find((candidate) => candidate.id === messageId);
  if (!message)
    throw new Error("That message no longer exists.");
  return message;
}
spindle.onFrontendMessage(async (raw, userId, frontendSessionId) => {
  const payload = raw;
  if (!payload || typeof payload !== "object" || typeof payload.type !== "string")
    return;
  try {
    if (payload.type === "stitch_edit" || payload.type === "stitch_edit_close") {
      const token = typeof payload.editorRequestId === "string" ? payload.editorRequestId : "";
      if (!/^[A-Za-z0-9-]{1,80}$/.test(token))
        throw new Error("Invalid editor request id.");
      const owner = JSON.stringify([userId, frontendSessionId ?? ""]);
      if (payload.type === "stitch_edit_close") {
        if (editors.get(token) === owner)
          await spindle.textEditor.close(token, userId);
        return;
      }
      if (typeof payload.value !== "string")
        throw new Error("Missing editor text.");
      if (editors.has(token))
        throw new Error("That editor is already open.");
      editors.set(token, owner);
      try {
        const result = await spindle.textEditor.open({
          title: "Edit stitched swipe",
          value: payload.value,
          editorRequestId: token,
          userId
        });
        send({ type: "stitch_edit_result", requestId: payload.requestId, ...result }, userId, frontendSessionId);
      } finally {
        editors.delete(token);
      }
      return;
    }
    if (payload.type === "stitch_open") {
      const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
      const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
      if (!chatId || !messageId)
        throw new Error("Missing chat or message id.");
      const message = await getMessage(chatId, messageId);
      if (message.role !== "assistant")
        throw new Error("Stitch is only available on assistant responses.");
      if (!Array.isArray(message.swipes) || message.swipes.length < 2) {
        throw new Error("This response needs at least two swipes to Stitch.");
      }
      send({
        type: "stitch_open_result",
        requestId: payload.requestId,
        chatId,
        messageId,
        swipes: message.swipes,
        activeSwipe: message.swipe_id,
        revision: await fingerprint(message)
      }, userId, frontendSessionId);
      return;
    }
    if (payload.type === "stitch_save") {
      const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
      const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
      const content = typeof payload.content === "string" ? payload.content : "";
      const revision = typeof payload.revision === "string" ? payload.revision : "";
      if (!chatId || !messageId || !revision)
        throw new Error("Missing Stitch save state.");
      if (!content.trim())
        throw new Error("The stitched swipe is empty.");
      const current = await getMessage(chatId, messageId);
      const currentRevision = await fingerprint(current);
      if (currentRevision !== revision) {
        send({
          type: "stitch_conflict",
          requestId: payload.requestId,
          error: "The source swipes changed while Stitch was open. Nothing was written."
        }, userId, frontendSessionId);
        return;
      }
      const newSwipeIndex = current.swipes.length;
      await spindle.chat.updateMessage(chatId, messageId, {
        swipes: [...current.swipes, content],
        swipe_id: newSwipeIndex
      });
      send({
        type: "stitch_save_result",
        requestId: payload.requestId,
        messageId,
        swipeIndex: newSwipeIndex
      }, userId, frontendSessionId);
    }
  } catch (error) {
    fail(payload.requestId, error, userId, frontendSessionId);
  }
});
