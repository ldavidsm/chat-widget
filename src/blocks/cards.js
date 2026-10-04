import { el } from '../core/dom.js';

const SAFE_IMAGE = /^(https?:\/\/|data:image\/|\/)/i;
const SAFE_LINK = /^(https?:\/\/|mailto:|\/)/i;

// { type: 'cards', items: [{ title, text, image, url, button, value }] }
export function cards(data, ctx) {
  const items = data.items ?? data.cards ?? [];
  if (!items.length) return null;

  const list = el('div', { class: `cw-cards${items.length > 1 ? ' cw-cards-scroll' : ''}` });

  for (const item of items) {
    const card = el('div', { class: 'cw-card' });

    if (item.image && SAFE_IMAGE.test(item.image)) {
      card.append(el('img', { class: 'cw-card-img', src: item.image, alt: item.title ?? '', loading: 'lazy' }));
    }

    const body = el('div', { class: 'cw-card-body' });
    if (item.title) body.append(el('div', { class: 'cw-card-title', text: item.title }));
    if (item.text) body.append(el('div', { class: 'cw-card-text', text: item.text }));

    // A card either links out or sends a message back into the thread.
    if (item.url && SAFE_LINK.test(item.url)) {
      body.append(el('a', {
        class: 'cw-card-btn',
        href: item.url,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
        text: item.button ?? 'Open',
      }));
    } else if (item.value || item.button) {
      body.append(el('button', {
        class: 'cw-card-btn',
        type: 'button',
        text: item.button ?? item.title,
        onclick: () => ctx.send(item.value ?? item.button ?? item.title),
      }));
    }

    card.append(body);
    list.append(card);
  }

  return list;
}
