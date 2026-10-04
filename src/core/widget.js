import { createEmitter } from './dom.js';
import { resolveRenderer } from './markdown.js';
import { createSession } from './session.js';
import { createTransport } from './transport.js';
import { createMessageList } from '../ui/messages.js';
import { createLauncher, createPanel } from '../ui/panel.js';
import { styles } from '../ui/styles.js';

const THEME_VARS = {
  primary: '--cw-primary',
  primaryHover: '--cw-primary-hover',
  dark: '--cw-dark',
  light: '--cw-light',
  surface: '--cw-surface',
  text: '--cw-text',
  muted: '--cw-muted',
  radius: '--cw-radius',
  width: '--cw-w',
  height: '--cw-h',
  launcherSize: '--cw-launcher-size',
  offset: '--cw-offset',
  fontBody: '--cw-font-body',
  fontHeading: '--cw-font-heading',
  shadow: '--cw-shadow',
  zIndex: '--cw-z',
};

const DEFAULT_TEXTS = {
  title: 'Assistant',
  status: 'Online',
  placeholder: 'Write a message…',
  send: 'Send message',
  close: 'Close chat',
  launcher: 'Open chat',
  greeting: '',
  error: 'Something went wrong. Please try again.',
  footer: '',
};

export class ChatWidget {
  constructor(options = {}) {
    this.options = options;
    this.texts = { ...DEFAULT_TEXTS, ...options.texts };

    this.isOpen = false;
    this.isBusy = false;
    this.hasOpened = false;
    this.history = [];
    this.destroyed = false;

    this.events = createEmitter();
    this.session = createSession({ key: options.key ?? 'default', ...options.session });
    this.render = resolveRenderer(options.markdown);
    this.transport = createTransport(options);

    // Convenience: callbacks passed as options behave like event listeners.
    for (const [option, event] of Object.entries({
      onOpen: 'open', onClose: 'close', onMessage: 'message', onError: 'error', onReady: 'ready',
    })) {
      if (typeof options[option] === 'function') this.events.on(event, options[option]);
    }

    this.#build();
  }

  // ── Lifecycle ──────────────────────────────────────────

  #build() {
    const { options } = this;

    this.host = document.createElement('div');
    this.host.setAttribute('data-chat-widget', options.key ?? 'default');

    this.shadow = this.host.attachShadow({ mode: 'open' });

    const sheet = document.createElement('style');
    sheet.textContent = styles;
    this.shadow.append(sheet);

    this.root = document.createElement('div');
    this.root.className = `cw-root${options.position === 'bottom-left' ? ' cw-left' : ''}`;

    this.messages = createMessageList({
      render: this.render,
      locale: options.locale,
      showTimes: options.showTimes !== false,
      onQuickReply: (value) => this.sendMessage(value),
    });

    this.launcher = createLauncher({
      label: this.texts.launcher,
      onToggle: () => this.toggle(),
    });

    this.panel = createPanel({
      texts: this.texts,
      avatar: options.avatar,
      messagesRoot: this.messages.root,
      onClose: () => this.close(),
      onSubmit: (text) => this.sendMessage(text),
    });

    this.root.append(this.panel.root, this.launcher.root);
    this.shadow.append(this.root);

    this.#applyTheme(options.theme);

    // Escape closes the panel while focus is inside it.
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen) {
        event.stopPropagation();
        this.close();
      }
    });

    // documentElement is the fallback for a script loaded in <head> without defer.
    const mount = options.container ?? document.body ?? document.documentElement;
    mount.append(this.host);

    if (options.badgeDelay !== false) {
      this.badgeTimer = setTimeout(() => {
        if (!this.hasOpened) this.launcher.showBadge(options.badge ?? 1);
      }, options.badgeDelay ?? 3000);
    }

    if (options.openOnLoad) this.open();

    this.events.emit('ready', this);
  }

  #applyTheme(theme = {}) {
    for (const [key, variable] of Object.entries(THEME_VARS)) {
      if (theme[key] != null) this.host.style.setProperty(variable, String(theme[key]));
    }
  }

  setTheme(theme) {
    this.#applyTheme(theme);
    return this;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.badgeTimer);
    this.abort?.abort();
    this.host.remove();
  }

  // ── Open / close ───────────────────────────────────────

  open() {
    if (this.isOpen || this.destroyed) return this;
    this.isOpen = true;
    this.launcher.setOpen(true);
    this.launcher.markSeen();
    this.launcher.hideBadge();
    this.panel.setOpen(true);
    this.panel.focus();

    if (!this.hasOpened) {
      this.hasOpened = true;
      this.#greet();
    }

    this.events.emit('open', this);
    return this;
  }

  close() {
    if (!this.isOpen) return this;
    this.isOpen = false;
    this.launcher.setOpen(false);
    this.panel.setOpen(false);
    this.events.emit('close', this);
    return this;
  }

  toggle() {
    return this.isOpen ? this.close() : this.open();
  }

  #greet() {
    const { greeting } = this.texts;
    const { quickReplies } = this.options;
    if (!greeting && !quickReplies) return;

    // A beat of delay reads as the assistant answering rather than a static page.
    setTimeout(() => {
      if (this.destroyed) return;
      if (greeting) {
        this.messages.addBot(greeting);
        this.history.push({ role: 'assistant', content: greeting });
      }
      if (quickReplies?.length) this.messages.addQuickReplies(quickReplies);
    }, this.options.greetingDelay ?? 400);
  }

  // ── Conversation ───────────────────────────────────────

  async sendMessage(text) {
    const message = String(text ?? '').trim();
    if (!message || this.isBusy || this.destroyed) return;

    this.messages.addUser(message);
    this.#track({ role: 'user', content: message });

    this.isBusy = true;
    this.panel.setBusy(true);
    this.messages.showTyping();

    this.abort = new AbortController();

    const stream = this.messages.beginBot({
      onFirstChunk: () => this.messages.hideTyping(),
    });

    const ctx = {
      sessionId: this.session.id,
      history: this.history.slice(0, -1),
      message,
      signal: this.abort.signal,
      append: (chunk) => stream.append(chunk),
      set: (value) => stream.set(value),
      widget: this,
    };

    try {
      const result = await this.transport(message, ctx);
      this.messages.hideTyping();

      const reply = typeof result === 'string' ? result : result?.text;

      if (reply) stream.set(reply);

      if (stream.isEmpty && !reply) {
        this.messages.addError(this.texts.error);
        this.events.emit('error', new Error('Empty response from backend'));
      } else {
        this.#track({ role: 'assistant', content: stream.text });
      }

      if (result?.quickReplies?.length) this.messages.addQuickReplies(result.quickReplies);
    } catch (error) {
      this.messages.hideTyping();
      if (stream.isEmpty) this.messages.addError(this.texts.error);
      console.error('[chat-widget]', error);
      this.events.emit('error', error);
    } finally {
      this.isBusy = false;
      this.panel.setBusy(false);
      this.abort = null;
      if (this.isOpen) this.panel.focus();
    }
  }

  #track(entry) {
    this.history.push(entry);
    const limit = this.options.historyLimit ?? 20;
    if (limit > 0 && this.history.length > limit) {
      this.history.splice(0, this.history.length - limit);
    }
    this.events.emit('message', entry);
  }

  // Public helper: drop a message into the thread without calling the backend.
  addMessage(role, text) {
    if (role === 'user') this.messages.addUser(text);
    else this.messages.addBot(text);
    this.#track({ role: role === 'user' ? 'user' : 'assistant', content: text });
    return this;
  }

  addQuickReplies(options) {
    this.messages.addQuickReplies(options);
    return this;
  }

  reset() {
    this.abort?.abort();
    this.messages.clear();
    this.history = [];
    this.session.reset();
    this.hasOpened = false;
    return this;
  }

  on(event, handler) {
    return this.events.on(event, handler);
  }

  off(event, handler) {
    this.events.off(event, handler);
    return this;
  }
}
