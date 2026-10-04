# chat-widget

A drop-in chat UI for any website. **You bring the backend.**

It is the part nobody wants to build — bubble, panel, streaming, markdown,
mobile, accessibility — with no opinion about where the answers come from.
Point it at an endpoint and it works; reshape the request and it works with
whatever API you already have.

- **~9 KB gzipped**, zero dependencies
- **Shadow DOM** — host CSS cannot reach in, widget CSS cannot leak out
- **Streaming** — SSE, NDJSON or plain text
- **No keys in the browser** — the widget talks to *your* backend, nothing else
- Works in plain HTML, WordPress, React, Vue, anything

## Install

```html
<script src="https://cdn.jsdelivr.net/npm/@luisdsm/chat-widget@0.1.0/dist/chat-widget.js"
        data-endpoint="https://your-api.com/chat"
        data-title="Support"
        data-greeting="Hi! How can I help?"
        async></script>
```

That is the whole integration. Pin the version as above so a release never
changes a live site under you; drop `@0.1.0` only if you want the latest.

Or with npm:

```bash
npm install @luisdsm/chat-widget
```

```js
import { init } from '@luisdsm/chat-widget';

const widget = init({ endpoint: 'https://your-api.com/chat' });
```

## The three levels

### 1. An endpoint

The widget POSTs JSON and reads the reply out of the response. Any of
`reply`, `message`, `text`, `output`, `answer`, `content`, `response` is found
automatically, as is the OpenAI `choices[0].message.content` shape.

```js
init({
  endpoint: 'https://your-api.com/chat',
  headers: { Authorization: 'Bearer public-session-token' },
  stream: true,
});
```

What it sends:

```json
{ "message": "hello", "sessionId": "sess_...", "history": [], "timestamp": "..." }
```

### 2. An endpoint with a different shape

Your API already exists and does not look like that. Map it:

```js
init({
  endpoint: 'https://your-n8n.com/webhook/chat',
  transformRequest:  (message, ctx) => ({ pregunta: message, sid: ctx.sessionId }),
  transformResponse: (data) => data.resultado[0].respuesta,
});
```

### 3. Your own function

Full control. Nothing is fetched for you; `ctx.append()` streams into the bubble.

```js
init({
  onSend: async (message, ctx) => {
    const stream = await myOwnLogic(message, ctx.history);
    for await (const chunk of stream) ctx.append(chunk);
  },
});
```

Return a string instead if you have the whole answer at once.

## Adapters

Presets that fill in levels 1–2 for a known backend. An adapter is just an
options object, so anything you pass alongside it wins.

```js
import { init, adapters } from '@luisdsm/chat-widget';

init({
  adapter: adapters.openai({
    endpoint: 'https://your-api.com/v1/chat/completions', // your proxy
    model: 'gpt-4o-mini',
    system: 'You are a concise assistant.',
  }),
  texts: { title: 'Assistant' },
});

init({
  adapter: adapters.n8n({ webhookUrl: 'https://your-n8n.com/webhook/abc' }),
});
```

## ⚠️ API keys do not belong here

The widget runs in the browser. Everything you pass to it — headers included —
is readable by anyone who opens devtools. **Never put an LLM API key in the
widget config.** Point `endpoint` at your own backend, keep the key there, and
let it call the model. A 20-line proxy is enough:

```python
from fastapi import FastAPI
from pydantic import BaseModel
import os, httpx

app = FastAPI()

class Turn(BaseModel):
    message: str
    sessionId: str | None = None

@app.post("/chat")
async def chat(turn: Turn):
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": turn.message}],
            },
        )
    return {"reply": res.json()["choices"][0]["message"]["content"]}
```

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `endpoint` | — | URL the widget POSTs to |
| `onSend` | — | Own the exchange yourself (replaces `endpoint`) |
| `adapter` | — | Preset options for a known backend |
| `stream` | `false` | Read the response as a stream |
| `method` | `'POST'` | HTTP method |
| `headers` | — | Object, or a function `(ctx) => headers` |
| `credentials` | — | Passed to `fetch` (`'include'` for cookie auth) |
| `timeout` | `60000` | Abort after this many ms |
| `transformRequest` | — | `(message, ctx) => body` |
| `transformResponse` | — | `(data, ctx) => string \| { text, quickReplies }` |
| `parseChunk` | — | `(payload) => string \| null` per stream chunk |
| `markdown` | `true` | `false` for plain text, or your own renderer |
| `position` | `'bottom-right'` | Or `'bottom-left'` |
| `avatar` | `'✨'` | Emoji, or an image URL |
| `quickReplies` | — | Buttons shown with the greeting |
| `openOnLoad` | `false` | Start open |
| `badgeDelay` | `3000` | Ms before the unread dot appears; `false` disables |
| `greetingDelay` | `400` | Ms before the greeting lands |
| `historyLimit` | `20` | Turns kept and sent as `history` |
| `showTimes` | `true` | Timestamps under messages |
| `locale` | browser | Used to format times |
| `key` | `'default'` | Namespaces the stored session; set it if you mount two widgets |
| `session` | — | `{ storage: 'local' \| 'session' \| false, id }` |
| `container` | `document.body` | Where to mount |
| `texts` | see below | All user-facing strings |
| `theme` | see below | Colors and sizing |

### texts

```js
texts: {
  title: 'Assistant',
  status: 'Online',
  placeholder: 'Write a message…',
  greeting: '',          // shown on first open
  error: 'Something went wrong. Please try again.',
  footer: '',
  send: 'Send message',
  close: 'Close chat',
  launcher: 'Open chat',
}
```

### theme

```js
theme: {
  primary: '#C9A96E',
  primaryHover: '#b8944f',
  dark: '#2a2118',
  light: '#fdf8f2',
  surface: '#ffffff',
  text: '#2a2118',
  radius: '20px',
  width: '400px',
  height: '580px',
  launcherSize: '60px',
  offset: '28px',
  fontBody: "'DM Sans', sans-serif",
  fontHeading: "'Cormorant Garamond', serif",
  zIndex: 2147483000,
}
```

Each key is a CSS custom property on the host element, so you can also set them
from your own stylesheet — custom properties pierce the shadow boundary:

```css
[data-chat-widget] { --cw-primary: #6366f1; }
```

Fonts are **not** loaded by the widget. The defaults fall back to the system
stack; load the families yourself if you want the original look.

## API

```js
const widget = init({ /* … */ });

widget.open();
widget.close();
widget.toggle();
widget.sendMessage('text');          // as if the user typed it
widget.addMessage('bot', '**hi**');  // insert without calling the backend
widget.addQuickReplies(['Yes', 'No']);
widget.setTheme({ primary: '#111' });
widget.reset();                      // clear thread + new session id
widget.destroy();

widget.on('open',    () => {});
widget.on('close',   () => {});
widget.on('message', ({ role, content }) => {});
widget.on('error',   (error) => {});
widget.on('ready',   (widget) => {});
```

`on()` returns an unsubscribe function. Every event is also available as an
`onOpen` / `onClose` / `onMessage` / `onError` / `onReady` option.

## Data attributes

For the no-JavaScript install. `data-endpoint` is what triggers auto-boot; add
`data-auto="false"` to load the script without starting a widget.

`data-endpoint` `data-stream` `data-key` `data-position` `data-avatar`
`data-locale` `data-open-on-load` `data-quick-replies` (`|`-separated)
`data-title` `data-status` `data-greeting` `data-placeholder` `data-footer`
`data-error` `data-primary` `data-dark` `data-light` `data-radius`
`data-width` `data-height` `data-z-index`

## Security

- Bot text is HTML-escaped before any markdown is applied, so a backend (or an
  LLM told to emit HTML) cannot inject markup. User text is never rendered as
  HTML at all.
- Links are only built for `http:`, `https:` and `mailto:` URLs, and always get
  `rel="noopener noreferrer nofollow"`.
- No cookies, no third-party requests, no analytics. The only network call is
  the one you configure.
- The session id lives in `sessionStorage` and is a random opaque string.

## Develop

```bash
npm install
npm test     # node --test, no browser needed
npm run build
npm run demo # builds, watches and serves the repo — open /demo/
```

`dist/` is a build artifact and is not in git: run `npm run build` (or
`npm run demo`) once after cloning, or the demo page will have no script to
load. Publishing rebuilds and runs the tests automatically.

## License

MIT
