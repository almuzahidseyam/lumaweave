// Preferences stay on this device. Legacy sync preferences are read once only
// when no local preferences exist; no camera or microphone data is stored.
(() => {
  const S = globalThis.__lumaweaveSettings;
  function createStore(storage) {
    async function load() {
      const local = await storage.local.get('settings');
      if (Object.hasOwn(local, 'settings')) return S.sanitize(local.settings);
      const legacy = storage.sync ? await storage.sync.get('settings') : {};
      const settings = S.sanitize(legacy.settings);
      await storage.local.set({ settings });
      return settings;
    }
    // Initiate the browser write immediately. A popup closing must not cancel a
    // timer that has not yet submitted its final preference change.
    const save = (settings) => storage.local.set({ settings: S.sanitize(settings) });
    return { load, save };
  }
  globalThis.__lumaweaveStorage = { createStore };
  if (typeof module !== 'undefined') module.exports = { createStore };
})();
