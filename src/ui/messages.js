import { el } from '../core/dom.js';

function timeLabel(locale) {
  return new Date().toLocaleTimeString(locale || undefined, { hour: '2-digit', minute: '2-digit' });
}

export function createMessageList({ render, locale, showTimes = true, onQuickReply }) {
  const root = el('div', {
    class: 'cw-messages',
    role: 'log',
    'aria-live': 'polite',
    'aria-relevant': 'additions text',
  });

  let typing = null;
  // Only auto-scroll when the user is already near the bottom, so reading
  // history is not interrupted by an incoming token.
  let pinned = true;

  root.addEventListener('scroll', () => {
    const distance = root.scrollHeight - root.scrollTop - root.clientHeight;
    pinned = distance < 60;
  });

  function scrollToBottom(force = false) {
    if (!force && !pinned) return;
    requestAnimationFrame(() => { root.scrollTop = root.scrollHeight; });
  }

  function addMessage(role, { html, text, extraClass } = {}) {
    const bubble = el('div', { class: 'cw-bubble' });
    if (html != null) bubble.innerHTML = html;
    else bubble.textContent = text ?? '';

    const node = el('div', { class: `cw-msg cw-${role}${extraClass ? ' ' + extraClass : ''}` }, [
      bubble,
      showTimes ? el('div', { class: 'cw-time', text: timeLabel(locale) }) : null,
    ]);

    root.append(node);
    scrollToBottom();
    return { node, bubble };
  }

  return {
    root,

    addUser(text) {
      // textContent, never innerHTML: user input is never rendered as markup.
      return addMessage('user', { text });
    },

    addBot(text) {
      return addMessage('bot', { html: render(text) });
    },

    addError(text) {
      return addMessage('bot', { text, extraClass: 'cw-error' });
    },

    // Handle for a message that fills in as chunks arrive.
    // `onFirstChunk` fires once, right before the bubble appears, so the
    // caller can drop the typing indicator at the exact right moment.
    beginBot({ onFirstChunk } = {}) {
      let buffer = '';
      let created = null;

      const write = (text) => {
        if (!created) {
          onFirstChunk?.();
          created = addMessage('bot', { html: render(text) });
        } else {
          created.bubble.innerHTML = render(text);
        }
        scrollToBottom();
      };

      return {
        append(chunk) {
          if (!chunk) return;
          buffer += chunk;
          write(buffer);
        },
        set(text) {
          buffer = String(text ?? '');
          write(buffer);
        },
        get text() { return buffer; },
        get isEmpty() { return buffer.length === 0; },
      };
    },

    addQuickReplies(options) {
      const buttons = options.map((option) => {
        const label = typeof option === 'string' ? option : option.label;
        const value = typeof option === 'string' ? option : (option.value ?? option.label);

        return el('button', {
          class: 'cw-quick-btn',
          type: 'button',
          text: label,
          onclick: (event) => {
            // Disable the whole group once one is picked.
            group.querySelectorAll('button').forEach((b) => { b.disabled = true; });
            event.currentTarget.classList.add('cw-selected');
            onQuickReply?.(value);
          },
        });
      });

      const group = el('div', { class: 'cw-quick' }, buttons);
      const node = el('div', { class: 'cw-msg cw-bot' }, [group]);
      root.append(node);
      scrollToBottom();
      return node;
    },

    showTyping() {
      if (typing) return;
      typing = el('div', { class: 'cw-msg cw-bot' }, [
        el('div', { class: 'cw-typing', 'aria-label': 'typing' }, [
          el('span', { class: 'cw-typing-dot' }),
          el('span', { class: 'cw-typing-dot' }),
          el('span', { class: 'cw-typing-dot' }),
        ]),
      ]);
      root.append(typing);
      scrollToBottom();
    },

    hideTyping() {
      typing?.remove();
      typing = null;
    },

    clear() {
      root.replaceChildren();
      typing = null;
      pinned = true;
    },

    scrollToBottom,
  };
}
