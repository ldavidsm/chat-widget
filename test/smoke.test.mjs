import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown } from '../src/core/markdown.js';
import { createTransport, pickReply } from '../src/core/transport.js';

// ── Markdown renderer must never emit markup it did not build itself ──

test('escapes HTML in bot text', () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)">');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('escapes script tags and quotes', () => {
  const html = renderMarkdown(`</div><script>alert('x')</script>`);
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('</div>'));
});

test('renders bold, italic and code', () => {
  assert.equal(renderMarkdown('**hi**'), '<strong>hi</strong>');
  assert.equal(renderMarkdown('_hi_'), '<em>hi</em>');
  assert.equal(renderMarkdown('`a<b`'), '<code>a&lt;b</code>');
});

test('markdown inside a code span stays literal', () => {
  assert.equal(renderMarkdown('`**x**`'), '<code>**x**</code>');
});

test('links only http(s) and mailto', () => {
  assert.ok(renderMarkdown('[a](https://x.com)').includes('href="https://x.com"'));
  const bad = renderMarkdown('[a](javascript:alert(1))');
  assert.ok(!bad.includes('href'), 'javascript: URL must not become a link');
  assert.ok(!renderMarkdown('[a](data:text/html,x)').includes('href'));
});

test('newlines become breaks', () => {
  assert.equal(renderMarkdown('a\nb'), 'a<br>b');
});

// ── Reply extraction across backend shapes ──

test('pickReply understands common shapes', () => {
  assert.equal(pickReply({ reply: 'a' }), 'a');
  assert.equal(pickReply({ output: 'b' }), 'b');
  assert.equal(pickReply([{ output: 'c' }]), 'c');
  assert.equal(pickReply({ choices: [{ message: { content: 'd' } }] }), 'd');
  assert.equal(pickReply('plain'), 'plain');
});

// ── Transport ──

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(chunks) {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function ctx(collect = []) {
  return { sessionId: 's1', history: [], append: (c) => collect.push(c), set: () => {}, collect };
}

test('plain endpoint posts the default body and reads the reply', async () => {
  let seen;
  global.fetch = async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return jsonResponse({ reply: 'hello' });
  };

  const send = createTransport({ endpoint: 'https://api.test/chat' });
  const result = await send('hi', ctx());

  assert.equal(seen.url, 'https://api.test/chat');
  assert.equal(seen.body.message, 'hi');
  assert.equal(seen.body.sessionId, 's1');
  assert.equal(result.text, 'hello');
});

test('transformRequest/Response adapt a foreign API shape', async () => {
  let body;
  global.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return jsonResponse({ data: { respuesta: 'ok' } });
  };

  const send = createTransport({
    endpoint: 'https://api.test/x',
    transformRequest: (msg, c) => ({ pregunta: msg, sid: c.sessionId }),
    transformResponse: (data) => data.data.respuesta,
  });

  const result = await send('hola', ctx());
  assert.equal(body.pregunta, 'hola');
  assert.equal(body.sid, 's1');
  assert.equal(result.text, 'ok');
});

test('streams OpenAI-style SSE deltas in order', async () => {
  global.fetch = async () => sseResponse([
    'data: {"choices":[{"delta":{"content":"He"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n',
  ]);

  const collected = [];
  const send = createTransport({ endpoint: 'https://api.test/stream', stream: true });
  const result = await send('hi', ctx(collected));

  assert.equal(collected.join(''), 'Hello world');
  assert.equal(result, null, 'streamed replies are written through ctx.append');
});

test('handles an SSE event split across network chunks', async () => {
  global.fetch = async () => sseResponse([
    'data: {"choices":[{"delta":{"content":"par',
    'tial"}}]}\n\n',
  ]);

  const collected = [];
  const send = createTransport({ endpoint: 'https://api.test/stream', stream: true });
  await send('hi', ctx(collected));
  assert.equal(collected.join(''), 'partial');
});

test('streams plain text bodies too', async () => {
  global.fetch = async () => new Response('one\ntwo\n', { headers: { 'content-type': 'text/plain' } });
  const collected = [];
  const send = createTransport({ endpoint: 'https://api.test/stream', stream: true });
  await send('hi', ctx(collected));
  assert.equal(collected.join(''), 'one\ntwo\n');
});

test('raises on HTTP errors', async () => {
  global.fetch = async () => new Response('nope', { status: 500 });
  const send = createTransport({ endpoint: 'https://api.test/x' });
  await assert.rejects(() => send('hi', ctx()), /HTTP 500/);
});

test('onSend bypasses fetch entirely', async () => {
  global.fetch = async () => { throw new Error('should not be called'); };
  const send = createTransport({ onSend: async (msg) => `echo: ${msg}` });
  assert.equal((await send('hi', ctx())).text, 'echo: hi');
});

test('requires an endpoint or onSend', () => {
  assert.throws(() => createTransport({}), /endpoint/);
});
