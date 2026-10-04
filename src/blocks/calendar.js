import { el } from '../core/dom.js';

// ── Pure helpers (unit-tested, no DOM) ──────────────────

// Local date key. Deliberately not toISOString(): that converts to UTC and
// shifts the day backwards for anyone east of Greenwich.
export function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Accepts an ISO string or an object from whatever your backend already returns.
export function parseSlot(raw) {
  if (!raw) return null;

  const start = typeof raw === 'string'
    ? raw
    : raw.start ?? raw.slot_start ?? raw.datetime ?? raw.at ?? raw.time;
  if (!start) return null;

  // "2026-10-07 10:00:00" (Postgres style) is not valid ISO in every browser.
  const date = new Date(String(start).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return null;

  const object = typeof raw === 'object' ? raw : {};
  return {
    date,
    key: dateKey(date),
    staff: object.staff ?? object.staff_name ?? null,
    label: object.label ?? null,
    raw,
  };
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
  noSlots: 'No availability',
  noSlotsDetail: 'Nothing free on this day',
  prev: 'Previous month',
  next: 'Next month',
  loadFailed: 'Could not load availability',
};

function defaultSelectMessage(slot, { locale, service }) {
  const day = slot.date.toLocaleDateString(locale || undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const time = slot.date.toLocaleTimeString(locale || undefined, {
    hour: '2-digit', minute: '2-digit',
  });

  const parts = [`${day} at ${time}`];
  if (slot.staff) parts.push(`with ${slot.staff}`);
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
      else ctx.send(selectMessage(slot, { locale, service, ctx }));
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

      for (const slot of slots) {
        const time = slot.label ?? slot.date.toLocaleTimeString(locale || undefined, {
          hour: '2-digit', minute: '2-digit',
        });

        const button = el('button', {
          class: 'cw-cal-slot',
          type: 'button',
          disabled: state.done,
          onclick: () => pickSlot(slot),
        }, [el('span', { text: time })]);

        // Only the first name fits; the full one stays in the title.
        if (slot.staff) {
          button.append(el('span', { class: 'cw-cal-slot-staff', text: slot.staff.split(' ')[0] }));
          button.setAttribute('title', slot.staff);
        }
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
