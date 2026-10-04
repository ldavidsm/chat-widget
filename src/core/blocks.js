// Block system.
//
// A reply can carry structured content next to its text:
//
//   { "reply": "Pick a day", "blocks": [{ "type": "calendar", "service": "..." }] }
//
// The widget itself knows nothing about what a block means. It looks the type
// up in a registry and hands rendering over. Built-in types can be replaced,
// and new ones registered, from the `blocks` option.

export function normalizeBlocks(raw) {
  if (!raw) return [];

  const list = Array.isArray(raw) ? raw : [raw];

  return list
    .map((block) => {
      if (!block || typeof block !== 'object') return null;
      // { type: 'calendar', ...data }
      if (typeof block.type === 'string') return block;
      // { calendar: { ...data } } — single-key shorthand
      const keys = Object.keys(block);
      if (keys.length === 1) {
        const [type] = keys;
        const data = block[type];
        return { type, ...(Array.isArray(data) ? { items: data } : data) };
      }
      return null;
    })
    .filter(Boolean);
}

export function createBlockRegistry(custom = {}, defaults = {}) {
  const registry = { ...defaults, ...custom };

  return {
    has(type) {
      return typeof registry[type] === 'function';
    },

    render(block, ctx) {
      const renderer = registry[block.type];

      if (typeof renderer !== 'function') {
        console.warn(
          `[chat-widget] no renderer for block type "${block.type}". ` +
          `Register one with { blocks: { ${block.type}: (data, ctx) => node } }.`
        );
        return null;
      }

      try {
        const { type, ...data } = block;
        return renderer(data, ctx) ?? null;
      } catch (error) {
        console.error(`[chat-widget] block "${block.type}" failed to render:`, error);
        return null;
      }
    },
  };
}
