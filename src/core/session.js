// Session id, persisted per widget so a reload continues the same conversation.
// Storage can be unavailable (private mode, blocked cookies) — never throw.

function newId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `sess_${Date.now().toString(36)}_${rand}`;
}

function safeStorage(preferred) {
  try {
    const store = preferred === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__cw_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function createSession({ key = 'chat-widget', storage = 'session', id = null } = {}) {
  const store = storage === false ? null : safeStorage(storage);
  const storageKey = `cw:${key}:session`;

  let current = id || store?.getItem(storageKey) || newId();
  if (!id) store?.setItem(storageKey, current);

  return {
    get id() {
      return current;
    },
    reset() {
      current = newId();
      store?.setItem(storageKey, current);
      return current;
    },
  };
}
