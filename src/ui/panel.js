import { el, svg } from '../core/dom.js';
import { ICONS } from './icons.js';

export function createLauncher({ label, onToggle }) {
  const badge = el('div', { class: 'cw-badge', 'aria-hidden': 'true', text: '1' });

  const button = el('button', {
    class: 'cw-launcher',
    type: 'button',
    'aria-label': label,
    'aria-expanded': 'false',
    onclick: onToggle,
  }, [
    badge,
    svg('0 0 24 24', ICONS.chat, 'cw-ico-chat'),
    svg('0 0 24 24', ICONS.close, 'cw-ico-close'),
  ]);

  return {
    root: button,
    badge,
    setOpen(open) {
      button.classList.toggle('cw-open', open);
      button.setAttribute('aria-expanded', String(open));
    },
    markSeen() {
      button.classList.add('cw-seen');
    },
    showBadge(value) {
      if (value != null) badge.textContent = String(value);
      badge.classList.add('cw-show');
    },
    hideBadge() {
      badge.classList.remove('cw-show');
    },
  };
}

export function createPanel({ texts, avatar, messagesRoot, onClose, onSubmit }) {
  const input = el('textarea', {
    class: 'cw-input',
    rows: '1',
    placeholder: texts.placeholder,
    'aria-label': texts.placeholder,
  });

  // Grow with the content up to the CSS max-height.
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 100)}px`;
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  function submit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    onSubmit(text);
  }

  const sendButton = el('button', {
    class: 'cw-send',
    type: 'button',
    'aria-label': texts.send,
    onclick: submit,
  }, [svg('0 0 24 24', ICONS.send)]);

  const avatarNode = el('div', { class: 'cw-avatar' });
  if (typeof avatar === 'string' && /^(https?:|data:|\/)/.test(avatar)) {
    avatarNode.append(el('img', { src: avatar, alt: '' }));
  } else {
    avatarNode.textContent = avatar ?? '✨';
  }

  const title = el('div', { class: 'cw-title', text: texts.title });
  const status = el('div', { class: 'cw-status' }, [
    el('span', { class: 'cw-status-dot' }),
    el('span', { text: texts.status }),
  ]);

  const root = el('div', {
    class: 'cw-panel',
    role: 'dialog',
    'aria-modal': 'false',
    'aria-label': texts.title,
  }, [
    el('div', { class: 'cw-header' }, [
      avatarNode,
      el('div', { class: 'cw-header-info' }, [title, texts.status ? status : null]),
      el('button', {
        class: 'cw-close',
        type: 'button',
        'aria-label': texts.close,
        onclick: onClose,
      }, [svg('0 0 24 24', ICONS.close)]),
    ]),
    messagesRoot,
    el('div', { class: 'cw-composer' }, [input, sendButton]),
    texts.footer ? el('div', { class: 'cw-footer', text: texts.footer }) : null,
  ]);

  return {
    root,
    input,
    sendButton,
    setOpen(open) {
      root.classList.toggle('cw-open', open);
    },
    setBusy(busy) {
      sendButton.disabled = busy;
    },
    setTitle(value) {
      title.textContent = value;
    },
    focus() {
      // Avoid stealing focus on touch devices, where it pops the keyboard up.
      if (!window.matchMedia('(hover: none)').matches) input.focus();
    },
  };
}
