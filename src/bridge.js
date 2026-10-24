// Isolated-world script: the page-world scripts have no chrome.* APIs, so this
// relays between them and the extension (base URL, stored settings, popup).
// Settings are passed through raw; the page side validates them. (Chrome
// injects each file only once per page, so settings.js must stay listed only in
// the page-world group, not here.)
(() => {
  document.documentElement.dataset.plexusBase = chrome.runtime.getURL('');

  let state = { active: false, engine: false, tracking: 'not started' };
  const post = (type, extra = {}) => window.postMessage({ __plexus: type, ...extra }, location.origin);

  async function pushSettings() {
    try {
      const { settings } = await chrome.storage.sync.get('settings');
      post('settings', { settings: settings || {} });
    } catch (error) {
      post('settings', { settings: {} });
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) post('settings', { settings: changes.settings.newValue || {} });
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data.__plexus !== 'string') return;
    const msg = event.data;
    if (msg.__plexus === 'hello') pushSettings();
    if (msg.__plexus === 'state') {
      state = { active: !!msg.active, engine: !!msg.engine, tracking: String(msg.tracking || '') };
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'plexus:toggle') {
      post('toggle');
      setTimeout(() => sendResponse(state), 150);
      return true;
    }
    if (msg?.type === 'plexus:state') {
      sendResponse(state);
    }
    return false;
  });

  pushSettings();
})();
