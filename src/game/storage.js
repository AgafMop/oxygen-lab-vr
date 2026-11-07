// localStorage wrapper that never throws: a blocked store only loses resume.
export function createStorage(backend) {
  if (backend === undefined) { try { backend = globalThis.localStorage; } catch { backend = null; } }  // the getter itself can throw
  return {
    get(key) {
      try { const raw = backend?.getItem(key); return raw == null ? null : JSON.parse(raw); } catch { return null; }
    },
    set(key, val) {
      try { backend?.setItem(key, JSON.stringify(val)); } catch { /* resume lost, game goes on */ }
    },
  };
}
