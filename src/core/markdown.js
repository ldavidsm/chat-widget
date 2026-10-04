// Safe-by-construction markdown renderer.
//
// Everything is HTML-escaped FIRST, then we re-introduce only the tags we
// generate ourselves. Text coming from someone else's backend (or an LLM that
// was told to emit HTML) can therefore never inject markup.

const SAFE_SCHEME = /^(?:https?:\/\/|mailto:)/i;

export function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Receives an already-escaped URL. Returns null when it is not safe to link.
function safeUrl(escaped) {
  const url = escaped.trim();
  if (!SAFE_SCHEME.test(url)) return null;
  // Already-escaped text cannot contain raw quotes or angle brackets, but
  // whitespace and backslashes would still let a URL break out of the attribute.
  if (/[\s\\]/.test(url)) return null;
  return url;
}

function link(url, label) {
  const href = safeUrl(url);
  if (!href) return label;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
}

export function renderMarkdown(text) {
  // Strip control characters so our placeholders can never collide with input.
  const clean = String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  const codeSpans = [];
  let out = escapeHtml(clean)
    // Protect code spans before any other transform touches them.
    .replace(/`([^`\n]+)`/g, (_, code) => {
      codeSpans.push(code);
      return `\u0000${codeSpans.length - 1}\u0000`;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    // [label](url)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, url) => link(url, label))
    // Bare URLs that are not already inside an href we just built.
    .replace(/(^|[\s])(https?:\/\/[^\s<]+)/g, (_, pre, url) => `${pre}${link(url, url)}`)
    .replace(/\n/g, '<br>');

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
}

// `markdown` option: true (default), false (plain text), or a custom function.
export function resolveRenderer(markdown) {
  if (markdown === false) return (text) => escapeHtml(text).replace(/\n/g, '<br>');
  if (typeof markdown === 'function') return markdown;
  return renderMarkdown;
}
