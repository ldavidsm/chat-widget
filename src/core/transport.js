// Transport layer: the part that makes the widget backend-agnostic.
//
// Three levels of integration, cheapest first:
//   1. endpoint                                  -> POST { message, sessionId, history }
//   2. endpoint + transformRequest/Response       -> adapt to any API shape
//   3. onSend(message, ctx)                       -> you own the whole exchange

const END = Symbol('end-of-stream');

const REPLY_KEYS = ['reply', 'message', 'text', 'output', 'answer', 'content', 'response'];

// Best-effort extraction of assistant text out of an unknown JSON shape.
export function pickReply(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return pickReply(data[0]);
  if (typeof data !== 'object') return String(data);

  // OpenAI-compatible
  const choice = data.choices?.[0];
  if (choice) return choice.message?.content ?? choice.delta?.content ?? choice.text ?? '';

  for (const key of REPLY_KEYS) {
    const value = data[key];
    if (typeof value === 'string' && value) return value;
    // One level of nesting covers n8n's { data: { reply } } and similar.
    if (value && typeof value === 'object') {
      const nested = pickReply(value);
      if (nested) return nested;
    }
  }
  return '';
}

function defaultParseChunk(payload) {
  const trimmed = payload.trim();
  if (!trimmed) return null;
  if (trimmed === '[DONE]' || trimmed === 'DONE') return END;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      const delta = data.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') return delta;
      return pickReply(data) || null;
    } catch {
      // Not valid JSON after all — treat it as literal text.
      return payload;
    }
  }
  return payload;
}

// Some payloads in a stream carry structured blocks rather than text; they are
// collected out of band so a booking calendar can follow a streamed answer.
function peekBlocks(payload) {
  const trimmed = payload.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed).blocks ?? null;
  } catch {
    return null;
  }
}

async function consumeStream(response, { parseChunk, emit, onBlocks, onProgress }) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isSSE = contentType.includes('text/event-stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let finished = false;

  const handle = (payload) => {
    if (finished) return;

    const blocks = peekBlocks(payload);
    if (blocks) onBlocks(blocks);

    const piece = parseChunk(payload);
    if (piece === END || piece === false) { finished = true; return; }
    if (typeof piece === 'string' && piece) emit(piece);
  };

  // An SSE event is a block of lines separated by a blank line; only `data:` matters.
  const handleSSEBlock = (block) => {
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) continue;
      handle(trimmed.slice(5).trim());
    }
  };

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    onProgress?.();
    buffer += decoder.decode(value, { stream: true });

    if (isSSE) {
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      blocks.forEach(handleSSEBlock);
    } else {
      // Newline-delimited JSON gets parsed per line; anything else streams through raw.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) handle(line);
        else if (line) emit(line + '\n');
      }
    }
  }

  if (buffer.trim() && !finished) {
    if (isSSE) handleSSEBlock(buffer);
    else handle(buffer);
  }

  try { reader.releaseLock(); } catch { /* already released */ }
}

async function parseBody(response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) return response.json();

  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

export function createTransport(options = {}) {
  const {
    endpoint,
    method = 'POST',
    headers,
    credentials,
    stream = false,
    timeout = 60000,
    onSend,
    transformRequest,
    transformResponse,
    parseChunk = defaultParseChunk,
  } = options;

  if (!onSend && !endpoint) {
    throw new Error('[chat-widget] needs either an `endpoint` or an `onSend` function.');
  }

  // Level 3 — the host owns the exchange entirely.
  if (onSend) {
    return async (message, ctx) => {
      const result = await onSend(message, ctx);
      if (typeof result === 'string' && result) return { text: result };
      return result || null;
    };
  }

  return async (message, ctx) => {
    const resolvedHeaders = typeof headers === 'function' ? await headers(ctx) : headers;

    const body = transformRequest
      ? await transformRequest(message, ctx)
      : {
          message,
          sessionId: ctx.sessionId,
          history: ctx.history,
          timestamp: new Date().toISOString(),
        };

    // Compose the caller's abort signal with our own timeout.
    const controller = new AbortController();
    const abort = () => controller.abort();
    ctx.signal?.addEventListener('abort', abort, { once: true });

    // `timeout` is how long we wait for the NEXT byte, not a budget for the
    // whole answer: every chunk resets it. A tool-calling backend can
    // legitimately spend two minutes on one reply, and a total budget cut it
    // off mid-sentence with nothing on screen to explain why.
    let timer = timeout ? setTimeout(abort, timeout) : null;
    const touch = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = setTimeout(abort, timeout);
    };

    try {
      const response = await fetch(endpoint, {
        method,
        credentials,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(stream ? { Accept: 'text/event-stream' } : null),
          ...resolvedHeaders,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
      }

      if (stream && response.body) {
        const blocks = [];
        await consumeStream(response, {
          parseChunk,
          emit: ctx.append,
          onBlocks: (list) => blocks.push(...[].concat(list)),
          onProgress: touch,
        });
        // The text already streamed into the bubble; only blocks are left to return.
        return blocks.length ? { blocks } : null;
      }

      const data = await parseBody(response);

      if (transformResponse) {
        const result = await transformResponse(data, ctx);
        return typeof result === 'string' ? { text: result } : (result || null);
      }

      const payload = Array.isArray(data) ? data[0] : data;
      return {
        text: pickReply(data),
        blocks: payload?.blocks ?? null,
        quickReplies: payload?.quickReplies ?? payload?.quick_replies ?? null,
      };
    } finally {
      if (timer) clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', abort);
    }
  };
}
