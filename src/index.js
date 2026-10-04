import { ChatWidget } from './core/widget.js';
import * as adapters from './adapters/index.js';

export { ChatWidget, adapters };
export { renderMarkdown, escapeHtml } from './core/markdown.js';
export { pickReply } from './core/transport.js';

// An adapter returns plain options, so it merges with anything you pass.
export function init(options = {}) {
  const { adapter, ...own } = options;
  return new ChatWidget(adapter ? { ...adapter, ...own } : own);
}

export default { init, ChatWidget, adapters };
