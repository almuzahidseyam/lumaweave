// Toolbar popup: edits the stored settings (applied live by the Meet tab) and
// can toggle the effect on the active Meet tab.
(() => {
  const S = globalThis.__lumaweaveSettings;
  const store = globalThis.__lumaweaveStorage.createStore(chrome.storage);
  const $ = (id) => document.getElementById(id);

  let settings = S.sanitize({});
  let saveRevision = 0;

  function save(next) {
    settings = S.sanitize(next);
    render();
    const revision = ++saveRevision;
    showSaveStatus('Saving on this device…');
    store.save(settings).then(() => {
      if (revision === saveRevision) showSaveStatus('Saved on this device');
    }).catch(() => {
      if (revision === saveRevision) showSaveStatus('Could not save. Try again or export your settings.', true);
    });
  }

  function showSaveStatus(message, error = false) {
    $('saveStatus').textContent = message;
    $('saveStatus').classList.toggle('error', error);
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
      chip.dataset.preset = name;
      chip.setAttribute('aria-pressed', 'false');
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
    bindCheck('clapGesture', () => settings.clapGesture, (clapGesture) => ({ ...settings, clapGesture })),
    bindCheck('reducedMotion', () => settings.reducedMotion, (reducedMotion) => ({ ...settings, reducedMotion })),
  ];
  $('performance').addEventListener('change', () => save({ ...settings, performance: $('performance').value }));

  function render() {
    S.ELEMENTS.forEach((key) => {
      const el = settings.elements[key];
      $(`${key}On`).checked = el.on;
      $(`${key}Color`).value = el.color;
      $(`${key}On`).closest('.row').classList.toggle('disabled', !el.on);
    });
    renderers.forEach((fn) => fn());
    $('performance').value = settings.performance;
    document.querySelectorAll('[data-preset]').forEach((button) => {
      const preset = S.PRESETS[button.dataset.preset];
      button.setAttribute('aria-pressed', String(S.ELEMENTS.every(key => settings.elements[key].color === preset[key])));
    });
    $('spill').disabled = !settings.lightSpill.on;
    $('person').disabled = !settings.personLight.on;
    $('spill').closest('.row').classList.toggle('disabled', !settings.lightSpill.on);
    $('person').closest('.row').classList.toggle('disabled', !settings.personLight.on);
  }

  function showState(state) {
    const label = $('state');
    const button = $('toggle');
    if (!state) {
      label.textContent = 'Open a Google Meet tab';
      $('indicator').classList.remove('on');
      $('stateDetail').textContent = 'Try the preview, or open Meet and turn on your camera.';
      button.disabled = true;
      return;
    }
    button.disabled = !state.engine || state.tracking === 'failed';
    if (!state.engine) {
      label.textContent = 'Waiting for your camera';
      $('indicator').classList.remove('on');
      $('stateDetail').textContent = 'Turn on your camera in Meet to begin.';
      return;
    }
    label.textContent = state.active ? 'Your light is on' : state.tracking === 'failed' ? 'Tracking needs a restart' : 'Ready when you are';
    $('indicator').classList.toggle('on', state.active);
    $('stateDetail').textContent = state.tracking === 'failed' ? 'Restart your camera; reload Meet if needed.' : `Tracking: ${state.tracking} · ${state.hands || 0} hand(s) in view`;
    button.textContent = state.active ? 'Turn off the light' : 'Turn on the light';
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

  $('toggle').addEventListener('click', async () => showState(await ask('lumaweave:toggle')));
  $('reset').addEventListener('click', () => save(S.sanitize({})));
  $('preview').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('demo/index.html') }));
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ application: 'lumaweave', version: 1, settings }, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lumaweave-settings.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('import').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async () => {
    const file = $('importFile').files[0];
    if (!file) return;
    try {
      if (file.size > 32768) throw new Error('Choose a settings file smaller than 32 KB.');
      const data = JSON.parse(await file.text());
      if (data.application !== 'lumaweave' || data.version !== 1 || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
        throw new Error('Choose a LumaWeave settings export.');
      }
      save(data.settings);
    } catch (error) { showSaveStatus(error.message || 'Could not import settings.', true); }
    $('importFile').value = '';
  });

  buildPresets();
  buildElements();
  store.load().then(stored => {
    settings = S.sanitize(stored);
    render();
    $('controls').disabled = false;
    showSaveStatus('Saved on this device');
  }).catch(() => showSaveStatus('Preferences could not load. Reopen the extension to retry.', true));
  ask('lumaweave:state').then(showState);
  setInterval(() => ask('lumaweave:state').then(showState), 1000);
})();
