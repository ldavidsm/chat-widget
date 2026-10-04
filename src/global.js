// Browser build: exposes window.ChatWidget and, when the <script> tag carries
// a data-endpoint, boots the widget with no extra JavaScript at all.

import { ChatWidget, adapters, init } from './index.js';

const VERSION = '0.1.0';

const api = { init, ChatWidget, adapters, version: VERSION, instances: [] };

const boot = (options) => {
  const widget = init(options);
  api.instances.push(widget);
  return widget;
};

window.ChatWidget = Object.assign(window.ChatWidget ?? {}, api, { init: boot });

// ── Declarative boot from data attributes ────────────────
// Captured synchronously: document.currentScript is null once we go async.
const script = document.currentScript;

function parseBool(value, fallback = false) {
  if (value == null) return fallback;
  return value !== 'false' && value !== '0';
}

if (script?.dataset.endpoint && parseBool(script.dataset.auto, true)) {
  const d = script.dataset;

  boot({
    endpoint: d.endpoint,
    stream: parseBool(d.stream),
    key: d.key,
    position: d.position,
    avatar: d.avatar,
    locale: d.locale,
    openOnLoad: parseBool(d.openOnLoad),
    quickReplies: d.quickReplies ? d.quickReplies.split('|').map((s) => s.trim()) : undefined,
    texts: {
      ...(d.title ? { title: d.title } : null),
      ...(d.status ? { status: d.status } : null),
      ...(d.greeting ? { greeting: d.greeting } : null),
      ...(d.placeholder ? { placeholder: d.placeholder } : null),
      ...(d.footer ? { footer: d.footer } : null),
      ...(d.error ? { error: d.error } : null),
    },
    theme: {
      ...(d.primary ? { primary: d.primary } : null),
      ...(d.dark ? { dark: d.dark } : null),
      ...(d.light ? { light: d.light } : null),
      ...(d.radius ? { radius: d.radius } : null),
      ...(d.width ? { width: d.width } : null),
      ...(d.height ? { height: d.height } : null),
      ...(d.zIndex ? { zIndex: d.zIndex } : null),
    },
  });
}
