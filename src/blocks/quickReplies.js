import { el } from '../core/dom.js';

// { type: 'quickReplies', options: ['Yes', { label: '📅 Book', value: 'I want to book' }] }
export function quickReplies(data, ctx) {
  const options = data.options ?? data.items ?? [];
  if (!options.length) return null;

  const group = el('div', { class: 'cw-quick' });

  for (const option of options) {
    const label = typeof option === 'string' ? option : option.label;
    const value = typeof option === 'string' ? option : (option.value ?? option.label);

    group.append(el('button', {
      class: 'cw-quick-btn',
      type: 'button',
      text: label,
      onclick: (event) => {
        group.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        event.currentTarget.classList.add('cw-selected');
        ctx.send(value);
      },
    }));
  }

  return group;
}
