// n8n Chat Trigger / Webhook node.
// The Chat Trigger expects `chatInput` + `sessionId` and answers with `output`;
// a plain Webhook node can be shaped however you like, so `message` is sent too.

export function n8n({ webhookUrl, endpoint, extra, ...rest } = {}) {
  return {
    endpoint: webhookUrl ?? endpoint,
    transformRequest: (message, ctx) => ({
      chatInput: message,
      message,
      sessionId: ctx.sessionId,
      action: 'sendMessage',
      ...(typeof extra === 'function' ? extra(message, ctx) : extra),
    }),
    ...rest,
  };
}
