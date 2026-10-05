import { el } from '../core/dom.js';

// ── Pure helpers (unit-tested, no DOM) ──────────────────

// Local date key. Deliberately not toISOString(): that converts to UTC and
// shifts the day backwards for anyone east of Greenwich.
export function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// "2026-10-07 10:00:00" (Postgres style) is not valid ISO in every browser.
//
// A datetime with no offset is read as the VIEWER's local time, not the
// business's. Send offsets ("…T10:00:00+02:00") unless every visitor sits in
// the same timezone as the calendar.
function parseDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Anything bookable alongside the time: a person, a room, a bay, a machine.
// `staff` and `staff_name` keep working and land as type 'staff'.
export function normalizeResources(object) {
  const list = [];

  const push = (value, fallbackType) => {
    if (!value) return;
    const entry = typeof value === 'string'
      ? { label: value, type: fallbackType }
      : value.label
        ? { label: value.label, type: value.type ?? fallbackType }
        : null;
    if (!entry) return;
    if (list.some((r) => r.label === entry.label && r.type === entry.type)) return;
    list.push(entry);
  };

  for (const item of [].concat(object.resources ?? [])) push(item, 'resource');
  push(object.staff ?? object.staff_name, 'staff');
  push(object.room ?? object.resource, 'resource');

  return list;
}

// Accepts an ISO string or an object from whatever your backend already returns.
export function parseSlot(raw) {
  if (!raw) return null;

  const object = typeof raw === 'object' ? raw : {};
  const start = typeof raw === 'string'
    ? raw
    : object.start ?? object.slot_start ?? object.datetime ?? object.at ?? object.time;

  const date = parseDate(start);
  if (!date) return null;

  const end = parseDate(object.end ?? object.slot_end ?? object.finish);
  const minutes = object.duration ?? object.duration_minutes
    ?? (end ? Math.round((end - date) / 60000) : null);

  const resources = normalizeResources(object);
  const staff = resources.find((r) => r.type === 'staff')?.label ?? null;

  return {
    date,
    end,
    // Negative or absurd durations are treated as missing rather than shown.
    duration: minutes > 0 ? minutes : null,
    key: dateKey(date),
    resources,
    staff,
    label: object.label ?? null,
    raw,
  };
}

// "30 min", "1 h", "1 h 30", "3 h"
export function formatDuration(minutes, texts = {}) {
  if (!(minutes > 0)) return null;

  const hourUnit = texts.hour ?? 'h';
  const minuteUnit = texts.minute ?? 'min';

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) return `${rest} ${minuteUnit}`;
  if (!rest) return `${hours} ${hourUnit}`;
  return `${hours} ${hourUnit} ${rest}`;
}

export function groupSlots(list) {
  const groups = {};

  for (const raw of list ?? []) {
    const slot = parseSlot(raw);
    if (!slot) continue;
    (groups[slot.key] ??= []).push(slot);
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.date - b.date);
  }
  return groups;
}

// Leading nulls pad the first week so day 1 lands under its weekday.
export function monthGrid(year, month, { weekStart = 1 } = {}) {
  const offset = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  return cells;
}

export function weekdayLabels(locale, weekStart = 1) {
  const format = new Intl.DateTimeFormat(locale || undefined, { weekday: 'short' });
  const labels = [];

  // 2024-01-07 was a Sunday, so day-of-week maps straight onto the date.
  for (let i = 0; i < 7; i++) {
    labels.push(format.format(new Date(2024, 0, 7 + ((weekStart + i) % 7))));
  }
  return labels;
}

const DEFAULT_TEXTS = {
  title: 'Pick a date',
  units: { hour: 'h', minute: 'min' },
  noSlots: 'No availability',
  noSlotsDetail: 'Nothing free on this day',
  prev: 'Previous month',
  next: 'Next month',
  loadFailed: 'Could not load availability',
};

function defaultSelectMessage(slot, { locale, service, texts = {} }) {
  const day = slot.date.toLocaleDateString(locale || undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const time = slot.date.toLocaleTimeString(locale || undefined, {
    hour: '2-digit', minute: '2-digit',
  });

  const parts = [`${day} at ${time}`];

  const duration = formatDuration(slot.duration, texts.units);
  if (duration) parts.push(`(${duration})`);

  const people = slot.resources.filter((r) => r.type === 'staff').map((r) => r.label);
  const things = slot.resources.filter((r) => r.type !== 'staff').map((r) => r.label);

  if (people.length) parts.push(`with ${people.join(', ')}`);
  if (things.length) parts.push(`· ${things.join(', ')}`);
  if (service) parts.push(`— ${service}`);

  return parts.join(' ');
}

// ── Renderer ─────────────────────────────────────────────

/**
 * calendar()                      → expects `slots` inside the block payload
 * calendar({ loadSlots })         → fetches a month at a time, lazily
 *
 * loadSlots({ start, end, service, year, month, ctx }) => slots[]
 */
export function calendar(config = {}) {
  const { loadSlots, onSelect, selectMessage = defaultSelectMessage, weekStart = 1 } = config;

  return function renderCalendar(data, ctx) {
    const locale = config.locale ?? ctx.locale;
    const texts = { ...DEFAULT_TEXTS, ...config.texts, ...data.texts };
    const service = data.service ?? data.serviceName ?? null;
    const monthsAhead = data.monthsAhead ?? config.monthsAhead ?? 3;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const state = {
      year: today.getFullYear(),
      month: today.getMonth(),
      selected: null,
      groups: data.slots ? groupSlots(data.slots) : {},
      // null while a month is in flight, 'error' when it failed
      status: data.slots || !loadSlots ? 'ready' : null,
      done: false,
    };

    const card = el('div', { class: 'cw-cal' });

    function monthsFromNow() {
      return (state.year - today.getFullYear()) * 12 + (state.month - today.getMonth());
    }

    async function fetchMonth() {
      if (!loadSlots) return;

      state.status = null;
      state.groups = {};
      render();

      const firstOfMonth = new Date(state.year, state.month, 1);
      const start = firstOfMonth > today ? firstOfMonth : today;
      const end = new Date(state.year, state.month + 1, 0);

      try {
        const slots = await loadSlots({
          start: dateKey(start),
          end: dateKey(end),
          startDate: start,
          endDate: end,
          service,
          year: state.year,
          month: state.month + 1,
          ctx,
        });
        state.groups = groupSlots(slots);
        state.status = 'ready';
      } catch (error) {
        console.error('[chat-widget] calendar.loadSlots failed:', error);
        state.status = 'error';
      }
      render();
    }

    function goToMonth(delta) {
      const next = new Date(state.year, state.month + delta, 1);
      state.year = next.getFullYear();
      state.month = next.getMonth();
      state.selected = null;
      fetchMonth();
      if (!loadSlots) render();
    }

    function pickSlot(slot) {
      if (state.done) return;
      state.done = true;
      card.classList.add('cw-cal-done');
      render();

      if (onSelect) onSelect(slot, { ...ctx, service });
      else ctx.send(selectMessage(slot, { locale, service, texts, ctx }));
    }

    function renderSlots() {
      if (!state.selected) return null;

      const slots = state.groups[state.selected] ?? [];
      const dayLabel = new Date(`${state.selected}T12:00:00`).toLocaleDateString(
        locale || undefined, { weekday: 'long', day: 'numeric', month: 'long' },
      );

      if (!slots.length) {
        return el('div', { class: 'cw-cal-slots' }, [
          el('div', { class: 'cw-cal-slots-title', text: texts.noSlots }),
          el('div', { class: 'cw-cal-slots-empty', text: texts.noSlotsDetail }),
        ]);
      }

      const grid = el('div', { class: 'cw-cal-slots-grid' });

      const timeOf = (date) => date.toLocaleTimeString(locale || undefined, {
        hour: '2-digit', minute: '2-digit',
      });

      for (const slot of slots) {
        const time = slot.label ?? timeOf(slot.date);
        const duration = formatDuration(slot.duration, texts.units);

        const button = el('button', {
          class: 'cw-cal-slot',
          type: 'button',
          disabled: state.done,
          onclick: () => pickSlot(slot),
        }, [el('span', { text: time })]);

        // Second line is tight, so people show as a first name only and the
        // full detail lives in the tooltip.
        const meta = [
          duration,
          ...slot.resources.map((r) => (r.type === 'staff' ? r.label.split(' ')[0] : r.label)),
        ].filter(Boolean);

        if (meta.length) {
          button.append(el('span', { class: 'cw-cal-slot-meta', text: meta.join(' · ') }));
        }

        button.setAttribute('title', [
          slot.end ? `${time} – ${timeOf(slot.end)}` : time,
          duration,
          ...slot.resources.map((r) => r.label),
        ].filter(Boolean).join(' · '));

        grid.append(button);
      }

      return el('div', { class: 'cw-cal-slots' }, [
        el('div', { class: 'cw-cal-slots-title', text: dayLabel }),
        grid,
      ]);
    }

    function renderDays() {
      const grid = el('div', { class: 'cw-cal-days' });

      for (const date of monthGrid(state.year, state.month, { weekStart })) {
        if (!date) {
          grid.append(el('div', { class: 'cw-cal-day cw-cal-empty' }));
          continue;
        }

        const key = dateKey(date);
        const isPast = date < today;
        const hasSlots = (state.groups[key]?.length ?? 0) > 0;

        const classes = ['cw-cal-day'];
        if (date.getTime() === today.getTime()) classes.push('cw-cal-today');
        if (isPast) classes.push('cw-cal-past');
        else if (state.status === null) classes.push('cw-cal-loading');
        else if (hasSlots) classes.push('cw-cal-has-slots');
        else classes.push('cw-cal-no-slots');
        if (state.selected === key) classes.push('cw-cal-selected');

        const selectable = !isPast && hasSlots && !state.done;

        grid.append(el(selectable ? 'button' : 'div', {
          class: classes.join(' '),
          ...(selectable ? { type: 'button', onclick: () => { state.selected = key; render(); } } : null),
          text: String(date.getDate()),
        }));
      }

      return grid;
    }

    function render() {
      const monthLabel = new Date(state.year, state.month, 1)
        .toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' });

      const header = el('div', { class: 'cw-cal-header' }, [
        el('span', { class: 'cw-cal-title', text: data.title ?? texts.title }),
        el('div', { class: 'cw-cal-nav' }, [
          el('button', {
            type: 'button', text: '‹', 'aria-label': texts.prev,
            disabled: monthsFromNow() <= 0 || state.done,
            onclick: () => goToMonth(-1),
          }),
          el('button', {
            type: 'button', text: '›', 'aria-label': texts.next,
            disabled: monthsFromNow() >= monthsAhead || state.done,
            onclick: () => goToMonth(1),
          }),
        ]),
      ]);

      const weekdays = el('div', { class: 'cw-cal-weekdays' },
        weekdayLabels(locale, weekStart).map((label) =>
          el('div', { class: 'cw-cal-weekday', text: label })));

      card.replaceChildren(
        header,
        el('div', { class: 'cw-cal-month', text: monthLabel }),
        weekdays,
        renderDays(),
        state.status === 'error'
          ? el('div', { class: 'cw-cal-slots' }, [
              el('div', { class: 'cw-cal-slots-empty', text: texts.loadFailed }),
            ])
          : renderSlots(),
      );

      ctx.scrollToBottom?.();
    }

    render();
    if (loadSlots && !data.slots) fetchMonth();

    return card;
  };
}
