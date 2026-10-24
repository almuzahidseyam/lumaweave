// Isolated-world script: the page-world scripts have no chrome.* APIs, so this
// relays between them and the extension (base URL, stored settings, popup).
// Settings are passed through raw; the page side validates them. (Chrome
// injects each file only once per page, so settings.js must stay listed only in
// the page-world group, not here.)
(() => {
  document.documentElement.dataset.lumaweaveBase = chrome.runtime.getURL('');
  let settingsRevision = 0;

  let state = { active: false, engine: false, tracking: 'not started' };
  const post = (type, extra = {}) => window.postMessage({ __lumaweave: type, ...extra }, location.origin);

  async function pushSettings() {
    try {
      const revision = settingsRevision;
      const local = await chrome.storage.local.get('settings');
      const legacy = local.settings === undefined ? await chrome.storage.sync.get('settings') : {};
      const settings = local.settings === undefined ? legacy.settings || {} : local.settings;
      if (revision === settingsRevision) post('settings', { settings });
    } catch (error) {
      post('settings', { settings: {} });
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settingsRevision += 1;
      post('settings', { settings: changes.settings.newValue || {} });
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin || !event.data || typeof event.data.__lumaweave !== 'string') return;
    const msg = event.data;
    if (msg.__lumaweave === 'hello') pushSettings();
    if (msg.__lumaweave === 'state') {
      state = { active: !!msg.active, engine: !!msg.engine, tracking: String(msg.tracking || '').slice(0, 120),
        hands: Number.isInteger(msg.hands) ? Math.max(0, Math.min(2, msg.hands)) : 0 };
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'lumaweave:toggle') {
      post('toggle');
      setTimeout(() => sendResponse(state), 150);
      return true;
    }
    if (msg?.type === 'lumaweave:state') {
      sendResponse(state);
    }
    return false;
  });

  pushSettings();
})();
