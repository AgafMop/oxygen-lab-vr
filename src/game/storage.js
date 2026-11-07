// localStorage wrapper that never throws: a blocked store only loses resume.
export function createStorage(backend = globalThis.localStorage) {
  return {
    get(key) {
      try { const raw = backend?.getItem(key); return raw == null ? null : JSON.parse(raw); } catch { return null; }
    },
    set(key, val) {
      try { backend?.setItem(key, JSON.stringify(val)); } catch { /* resume lost, game goes on */ }
    },
  };
}
