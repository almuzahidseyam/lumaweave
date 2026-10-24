// Toolbar popup: edits the stored settings (applied live by the Meet tab) and
// can toggle the effect on the active Meet tab.
(() => {
  const S = globalThis.__plexusSettings;
  const SAVE_DELAY_MS = 200;
  const $ = (id) => document.getElementById(id);

  let settings = S.sanitize({});
  let saveTimer = null;

  // Debounced so dragging a slider or color picker doesn't hit storage quotas.
  function save(next) {
    settings = S.sanitize(next);
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.sync.set({ settings }).catch(() => {});
    }, SAVE_DELAY_MS);
  }

  const withElement = (key, patch) => ({
    ...settings,
    elements: { ...settings.elements, [key]: { ...settings.elements[key], ...patch } },
  });

  function buildPresets() {
    const wrap = $('presets');
    Object.entries(S.PRESETS).forEach(([name, colors]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      const swatches = document.createElement('span');
      swatches.className = 'swatches';
      ['glow', 'triangles', 'dust'].forEach((k) => {
        const dot = document.createElement('i');
        dot.style.background = colors[k];
        swatches.appendChild(dot);
      });
      chip.append(swatches, document.createTextNode(name));
      chip.addEventListener('click', () => save(S.applyPreset(settings, name)));
      wrap.appendChild(chip);
    });
  }

  function buildElements() {
    const list = $('elements');
    S.ELEMENTS.forEach((key) => {
      const li = document.createElement('li');
      const row = document.createElement('label');
      row.className = 'row';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.id = `${key}On`;
      check.addEventListener('change', () => save(withElement(key, { on: check.checked })));
      const name = document.createElement('span');
      name.textContent = S.LABELS[key];
      const color = document.createElement('input');
      color.type = 'color';
      color.id = `${key}Color`;
      color.setAttribute('aria-label', `${S.LABELS[key]} color`);
      color.addEventListener('input', () => save(withElement(key, { color: color.value })));
      row.append(check, name, color);
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  function bindSlider(id, read, write) {
    const input = $(id);
    input.addEventListener('input', () => save(write(Number(input.value))));
    return () => {
      input.value = read();
      $(`${id}Out`).textContent = `${read()}%`;
    };
  }

  function bindCheck(id, read, write) {
    const input = $(id);
    input.addEventListener('change', () => save(write(input.checked)));
    return () => { input.checked = read(); };
  }

  const renderers = [
    bindSlider('darken', () => settings.darken, (v) => ({ ...settings, darken: v })),
    bindCheck('spillOn', () => settings.lightSpill.on,
      (on) => ({ ...settings, lightSpill: { ...settings.lightSpill, on } })),
    bindSlider('spill', () => settings.lightSpill.strength,
      (strength) => ({ ...settings, lightSpill: { ...settings.lightSpill, strength } })),
    bindCheck('personOn', () => settings.personLight.on,
      (on) => ({ ...settings, personLight: { ...settings.personLight, on } })),
    bindSlider('person', () => settings.personLight.strength,
      (strength) => ({ ...settings, personLight: { ...settings.personLight, strength } })),
    bindCheck('clapSound', () => settings.clapSound, (clapSound) => ({ ...settings, clapSound })),
  ];

  function render() {
    S.ELEMENTS.forEach((key) => {
      const el = settings.elements[key];
      $(`${key}On`).checked = el.on;
      $(`${key}Color`).value = el.color;
      $(`${key}On`).closest('.row').classList.toggle('disabled', !el.on);
    });
    renderers.forEach((fn) => fn());
    $('spill').closest('.row').classList.toggle('disabled', !settings.lightSpill.on);
    $('person').closest('.row').classList.toggle('disabled', !settings.personLight.on);
  }

  function showState(state) {
    const label = $('state');
    const button = $('toggle');
    if (!state) {
      label.textContent = 'Open a Google Meet tab';
      label.classList.remove('on');
      button.disabled = true;
      return;
    }
    button.disabled = false;
    if (!state.engine) {
      label.textContent = 'Waiting for your camera';
      label.classList.remove('on');
      return;
    }
    label.textContent = state.active ? 'Effect is ON' : `Effect is off · tracking ${state.tracking}`;
    label.classList.toggle('on', state.active);
    button.textContent = state.active ? 'Turn off' : 'Turn on';
  }

  async function activeTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }

  async function ask(type) {
    try {
      const id = await activeTabId();
      return id === undefined ? null : await chrome.tabs.sendMessage(id, { type });
    } catch (error) {
      return null; // not a Meet tab (no content script there)
    }
  }

  $('toggle').addEventListener('click', async () => showState(await ask('plexus:toggle')));
  $('reset').addEventListener('click', () => save(S.sanitize({})));

  buildPresets();
  buildElements();
  chrome.storage.sync.get('settings').then(({ settings: stored }) => {
    settings = S.sanitize(stored);
    render();
  });
  ask('plexus:state').then(showState);
})();
