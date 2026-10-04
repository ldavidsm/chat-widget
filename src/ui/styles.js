// All styles live inside the shadow root, so these selectors can never leak
// into the host page and the host page's CSS can never reach in.
// Everything tunable is a custom property: those *do* pierce the shadow
// boundary, which is how the `theme` option works.

export const styles = `
:host {
  display: block;
  position: fixed;
  width: 0;
  height: 0;
  z-index: var(--cw-z, 2147483000);

  --cw-primary: #C9A96E;
  --cw-primary-hover: #b8944f;
  --cw-dark: #2a2118;
  --cw-light: #fdf8f2;
  --cw-surface: #ffffff;
  --cw-text: #2a2118;
  --cw-muted: #999999;
  --cw-radius: 20px;
  --cw-w: 400px;
  --cw-h: 580px;
  --cw-launcher-size: 60px;
  --cw-offset: 28px;
  --cw-font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --cw-font-heading: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
  --cw-shadow: 0 20px 60px rgba(42, 33, 24, .2), 0 4px 16px rgba(42, 33, 24, .12);

  font-family: var(--cw-font-body);
  font-size: 16px;
  line-height: 1.5;
  color: var(--cw-text);
  -webkit-font-smoothing: antialiased;
}

:host([hidden]) { display: none; }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

button, textarea { font: inherit; color: inherit; }

/* ── Launcher bubble ───────────────────────────────────── */
.cw-launcher {
  position: fixed;
  bottom: var(--cw-offset);
  right: var(--cw-offset);
  width: var(--cw-launcher-size);
  height: var(--cw-launcher-size);
  background: var(--cw-primary);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(201, 169, 110, .45), 0 2px 8px rgba(0, 0, 0, .15);
  transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), box-shadow .25s;
  animation: cw-launcher-in .5s cubic-bezier(.34, 1.56, .64, 1) both;
}
.cw-left .cw-launcher { right: auto; left: var(--cw-offset); }
.cw-launcher:hover {
  transform: scale(1.1);
  box-shadow: 0 12px 40px rgba(201, 169, 110, .55), 0 4px 12px rgba(0, 0, 0, .2);
}
.cw-launcher:focus-visible { outline: 3px solid var(--cw-dark); outline-offset: 3px; }
.cw-launcher.cw-open { transform: scale(.9); }
.cw-launcher svg { width: 26px; height: 26px; fill: #fff; pointer-events: none; }
.cw-launcher .cw-ico-close { display: none; }
.cw-launcher.cw-open .cw-ico-chat { display: none; }
.cw-launcher.cw-open .cw-ico-close { display: block; }

/* Attention ring, stopped once the panel has been opened. */
.cw-launcher::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--cw-primary);
  opacity: 0;
  animation: cw-pulse 2.5s ease-out infinite;
}
.cw-launcher.cw-open::before, .cw-launcher.cw-seen::before { animation: none; }

@keyframes cw-launcher-in {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes cw-pulse {
  0% { transform: scale(1); opacity: .6; }
  70% { transform: scale(1.35); opacity: 0; }
  100% { opacity: 0; }
}

.cw-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  background: #e05252;
  color: #fff;
  font-size: .65rem;
  font-weight: 700;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--cw-light);
  opacity: 0;
  transform: scale(0);
  transition: opacity .2s, transform .2s cubic-bezier(.34, 1.56, .64, 1);
}
.cw-badge.cw-show { opacity: 1; transform: scale(1); }

/* ── Panel ─────────────────────────────────────────────── */
.cw-panel {
  position: fixed;
  bottom: calc(var(--cw-offset) + var(--cw-launcher-size) + 12px);
  right: var(--cw-offset);
  width: var(--cw-w);
  height: var(--cw-h);
  max-height: calc(100vh - var(--cw-offset) * 2 - var(--cw-launcher-size) - 12px);
  background: var(--cw-light);
  border-radius: var(--cw-radius);
  box-shadow: var(--cw-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: translateY(20px) scale(.96);
  pointer-events: none;
  transition: opacity .3s cubic-bezier(.4, 0, .2, 1), transform .3s cubic-bezier(.4, 0, .2, 1);
}
.cw-left .cw-panel { right: auto; left: var(--cw-offset); }
.cw-panel.cw-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }

.cw-header {
  background: var(--cw-dark);
  padding: 1rem 1.2rem;
  display: flex;
  align-items: center;
  gap: .8rem;
  flex-shrink: 0;
}
.cw-avatar {
  width: 38px;
  height: 38px;
  background: var(--cw-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
  overflow: hidden;
}
.cw-avatar img { width: 100%; height: 100%; object-fit: cover; }
.cw-header-info { flex: 1; min-width: 0; }
.cw-title {
  font-family: var(--cw-font-heading);
  font-size: 1rem;
  font-weight: 600;
  color: var(--cw-light);
  letter-spacing: .5px;
}
.cw-status {
  font-size: .68rem;
  color: var(--cw-primary);
  display: flex;
  align-items: center;
  gap: .3rem;
  margin-top: .1rem;
}
.cw-status-dot {
  width: 6px;
  height: 6px;
  background: #4ade80;
  border-radius: 50%;
  animation: cw-blink 2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes cw-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: .3; }
}
.cw-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: .2rem;
  border-radius: 6px;
  display: flex;
  opacity: .5;
  transition: opacity .15s;
}
.cw-close:hover { opacity: 1; }
.cw-close:focus-visible { outline: 2px solid var(--cw-primary); opacity: 1; }
.cw-close svg { width: 16px; height: 16px; fill: var(--cw-light); }

/* ── Messages ──────────────────────────────────────────── */
.cw-messages {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: .6rem;
}
.cw-messages::-webkit-scrollbar { width: 4px; }
.cw-messages::-webkit-scrollbar-track { background: transparent; }
.cw-messages::-webkit-scrollbar-thumb { background: rgba(201, 169, 110, .3); border-radius: 2px; }

.cw-msg {
  display: flex;
  flex-direction: column;
  max-width: 82%;
  animation: cw-msg-in .2s ease both;
}
@keyframes cw-msg-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.cw-msg.cw-bot { align-self: flex-start; align-items: flex-start; }
.cw-msg.cw-user { align-self: flex-end; align-items: flex-end; }

.cw-bubble {
  padding: .65rem .9rem;
  border-radius: 16px;
  font-size: .85rem;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: anywhere;
}
.cw-msg.cw-bot .cw-bubble {
  background: var(--cw-surface);
  color: var(--cw-text);
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .06);
}
.cw-msg.cw-user .cw-bubble {
  background: var(--cw-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.cw-msg.cw-error .cw-bubble { background: #fff2f2; color: #a33; box-shadow: none; }
.cw-time { font-size: .6rem; color: #bbb; margin-top: .2rem; padding: 0 .2rem; }

.cw-bubble a { color: inherit; text-decoration: underline; }
.cw-bubble code {
  background: rgba(42, 33, 24, .08);
  padding: .1rem .3rem;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .9em;
}
.cw-bubble strong { font-weight: 600; }

.cw-typing {
  display: flex;
  gap: 4px;
  padding: .7rem .9rem;
  background: var(--cw-surface);
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .06);
  width: fit-content;
}
.cw-typing-dot {
  width: 6px;
  height: 6px;
  background: var(--cw-primary);
  border-radius: 50%;
  animation: cw-bounce .9s ease-in-out infinite;
}
.cw-typing-dot:nth-child(2) { animation-delay: .15s; }
.cw-typing-dot:nth-child(3) { animation-delay: .3s; }
@keyframes cw-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: .4; }
  30% { transform: translateY(-5px); opacity: 1; }
}

/* ── Quick replies ─────────────────────────────────────── */
.cw-quick { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .4rem; }
.cw-quick-btn {
  background: var(--cw-surface);
  border: 1.5px solid var(--cw-primary);
  border-radius: 20px;
  padding: .45rem .9rem;
  font-size: .78rem;
  color: #4a3728;
  cursor: pointer;
  transition: background .15s, color .15s, transform .15s;
  white-space: nowrap;
}
.cw-quick-btn:hover { background: var(--cw-primary); color: #fff; transform: scale(1.03); }
.cw-quick-btn:focus-visible { outline: 2px solid var(--cw-dark); outline-offset: 2px; }
.cw-quick-btn:disabled { opacity: .5; cursor: default; transform: none; }

/* ── Composer ──────────────────────────────────────────── */
.cw-composer {
  display: flex;
  align-items: flex-end;
  gap: .5rem;
  padding: .75rem 1rem;
  border-top: 1px solid rgba(201, 169, 110, .15);
  background: var(--cw-surface);
  flex-shrink: 0;
}
.cw-input {
  flex: 1;
  border: 1.5px solid rgba(201, 169, 110, .3);
  border-radius: 12px;
  padding: .6rem .9rem;
  font-size: .85rem;
  background: var(--cw-light);
  resize: none;
  outline: none;
  max-height: 100px;
  line-height: 1.4;
  transition: border-color .2s;
}
.cw-input:focus { border-color: var(--cw-primary); }
.cw-send {
  width: 38px;
  height: 38px;
  background: var(--cw-primary);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform .15s, background .15s;
}
.cw-send:hover { background: var(--cw-primary-hover); transform: scale(1.05); }
.cw-send:active { transform: scale(.95); }
.cw-send:focus-visible { outline: 2px solid var(--cw-dark); outline-offset: 2px; }
.cw-send:disabled { background: #ddd; cursor: not-allowed; transform: none; }
.cw-send svg { width: 18px; height: 18px; fill: #fff; }

.cw-footer {
  text-align: center;
  padding: .4rem;
  font-size: .6rem;
  color: #ccc;
  letter-spacing: .5px;
  flex-shrink: 0;
}
.cw-footer a { color: inherit; }

/* ── Mobile: the panel takes over the screen ───────────── */
@media (max-width: 480px) {
  .cw-panel {
    width: calc(100vw - 16px);
    height: calc(100vh - var(--cw-launcher-size) - 44px);
    max-height: none;
    right: 8px;
    left: 8px;
    bottom: calc(var(--cw-launcher-size) + 28px);
  }
  .cw-left .cw-panel { left: 8px; right: 8px; }
  .cw-launcher { --cw-offset: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;
