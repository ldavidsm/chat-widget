import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBlocks, createBlockRegistry } from '../src/core/blocks.js';
import { dateKey, parseSlot, groupSlots, monthGrid, weekdayLabels } from '../src/blocks/calendar.js';
import { createTransport } from '../src/core/transport.js';

// ── Block normalization ──

test('accepts a list of typed blocks', () => {
  const blocks = normalizeBlocks([{ type: 'calendar', service: 'x' }]);
  assert.deepEqual(blocks, [{ type: 'calendar', service: 'x' }]);
});

test('accepts a single block, not only a list', () => {
  assert.deepEqual(normalizeBlocks({ type: 'cards', items: [] }), [{ type: 'cards', items: [] }]);
});

test('accepts the single-key shorthand', () => {
  assert.deepEqual(normalizeBlocks([{ calendar: { service: 'x' } }]), [{ type: 'calendar', service: 'x' }]);
  assert.deepEqual(normalizeBlocks([{ quickReplies: ['a', 'b'] }]), [{ type: 'quickReplies', items: ['a', 'b'] }]);
});

test('drops junk instead of throwing', () => {
  assert.deepEqual(normalizeBlocks(['nope', null, 42, { a: 1, b: 2 }]), []);
  assert.deepEqual(normalizeBlocks(null), []);
});

// ── Registry ──

test('renders a registered block and passes its data through', () => {
  const seen = [];
  const registry = createBlockRegistry({ foo: (data) => { seen.push(data); return 'node'; } });

  assert.equal(registry.render({ type: 'foo', a: 1 }, {}), 'node');
  assert.deepEqual(seen, [{ a: 1 }], 'type is stripped from the data');
});

test('an unknown type warns and renders nothing', () => {
  const registry = createBlockRegistry({});
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(registry.render({ type: 'nope' }, {}), null);
  } finally {
    console.warn = warn;
  }
});

test('a throwing renderer cannot break the thread', () => {
  const registry = createBlockRegistry({ boom: () => { throw new Error('x'); } });
  const error = console.error;
  console.error = () => {};
  try {
    assert.equal(registry.render({ type: 'boom' }, {}), null);
  } finally {
    console.error = error;
  }
});

test('custom renderers override the built-ins', () => {
  const registry = createBlockRegistry({ calendar: () => 'mine' }, { calendar: () => 'theirs' });
  assert.equal(registry.render({ type: 'calendar' }, {}), 'mine');
});

// ── Calendar helpers ──

test('dateKey uses the local day, not UTC', () => {
  // 23:30 local would roll back a day under toISOString() east of Greenwich.
  assert.equal(dateKey(new Date(2026, 9, 7, 23, 30)), '2026-10-07');
  assert.equal(dateKey(new Date(2026, 0, 1, 0, 15)), '2026-01-01');
});

test('parseSlot reads the common slot shapes', () => {
  assert.equal(parseSlot('2026-10-07T10:00:00').key, '2026-10-07');
  assert.equal(parseSlot({ start: '2026-10-07T10:00:00' }).key, '2026-10-07');
  // Postgres-style space separator, as the original Supabase query returned.
  const pg = parseSlot({ slot_start: '2026-10-07 10:00:00', staff_name: 'Ana Pérez' });
  assert.equal(pg.key, '2026-10-07');
  assert.equal(pg.staff, 'Ana Pérez');
});

test('parseSlot rejects what it cannot read', () => {
  assert.equal(parseSlot(null), null);
  assert.equal(parseSlot({}), null);
  assert.equal(parseSlot('not a date'), null);
});

test('groupSlots buckets by day and sorts by time', () => {
  const groups = groupSlots([
    '2026-10-07T12:00:00',
    '2026-10-07T09:00:00',
    '2026-10-08T10:00:00',
    'garbage',
  ]);

  assert.deepEqual(Object.keys(groups).sort(), ['2026-10-07', '2026-10-08']);
  assert.equal(groups['2026-10-07'].length, 2);
  assert.equal(groups['2026-10-07'][0].date.getHours(), 9, 'earliest first');
});

test('monthGrid pads the first week and covers the month', () => {
  // October 2026 starts on a Thursday; Monday-first means 3 blanks.
  const cells = monthGrid(2026, 9, { weekStart: 1 });
  assert.equal(cells.slice(0, 3).filter((c) => c === null).length, 3);
  assert.equal(cells[3].getDate(), 1);
  assert.equal(cells.filter(Boolean).length, 31);
});

test('monthGrid respects a Sunday start', () => {
  const cells = monthGrid(2026, 9, { weekStart: 0 });
  assert.equal(cells.filter((c) => c === null).length, 4);
});

test('monthGrid handles a leap February', () => {
  assert.equal(monthGrid(2028, 1, {}).filter(Boolean).length, 29);
});

test('weekdayLabels returns seven labels in the requested order', () => {
  const monday = weekdayLabels('en-US', 1);
  const sunday = weekdayLabels('en-US', 0);

  assert.equal(monday.length, 7);
  assert.equal(sunday.length, 7);
  assert.notEqual(monday[0], sunday[0]);
  assert.equal(monday[0], sunday[1], 'shifting the start rotates the labels');
});

// ── Blocks over the wire ──

test('blocks come back next to the text from a plain endpoint', async () => {
  global.fetch = async () => new Response(
    JSON.stringify({ reply: 'Pick a day', blocks: [{ type: 'calendar', service: 'Facial' }] }),
    { headers: { 'content-type': 'application/json' } },
  );

  const send = createTransport({ endpoint: 'https://api.test/chat' });
  const result = await send('book', { sessionId: 's', history: [], append() {} });

  assert.equal(result.text, 'Pick a day');
  assert.deepEqual(result.blocks, [{ type: 'calendar', service: 'Facial' }]);
});

test('a streamed answer can still end with blocks', async () => {
  const body = new ReadableStream({
    start(controller) {
      const encode = (s) => new TextEncoder().encode(s);
      controller.enqueue(encode('data: {"choices":[{"delta":{"content":"Pick a day"}}]}\n\n'));
      controller.enqueue(encode('data: {"blocks":[{"type":"calendar"}]}\n\n'));
      controller.enqueue(encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  global.fetch = async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } });

  const chunks = [];
  const send = createTransport({ endpoint: 'https://api.test/s', stream: true });
  const result = await send('book', {
    sessionId: 's', history: [], append: (c) => chunks.push(c),
  });

  assert.equal(chunks.join(''), 'Pick a day');
  assert.deepEqual(result.blocks, [{ type: 'calendar' }]);
});

test('top-level quickReplies are picked up too', async () => {
  global.fetch = async () => new Response(
    JSON.stringify({ reply: 'Hi', quick_replies: ['Yes', 'No'] }),
    { headers: { 'content-type': 'application/json' } },
  );

  const send = createTransport({ endpoint: 'https://api.test/chat' });
  const result = await send('hi', { sessionId: 's', history: [], append() {} });
  assert.deepEqual(result.quickReplies, ['Yes', 'No']);
});
