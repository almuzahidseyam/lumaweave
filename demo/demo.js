(() => {
  const FX = globalThis.__lumaweaveFx;
  const S = globalThis.__lumaweaveSettings;
  const $ = id => document.getElementById(id);
  document.documentElement.dataset.lumaweaveBase = new URL('../', location.href).href;
  let settings = S.sanitize({});
  const store = globalThis.chrome?.storage ? globalThis.__lumaweaveStorage.createStore(chrome.storage) : null;
  let active = true;
  let stream = null;
  let opening = false;
  let disposed = false;
  let frameCallback = null;
  let frames = 0;
  let lastFpsAt = performance.now();
  const canvas = $('previewCanvas');
  const ctx = canvas.getContext('2d');
  const video = $('cameraVideo');
  const renderer = FX.createWeaveRenderer();
  const lighting = FX.createLighting();
  renderer.setActive(true);

  function applySettings() {
    FX.settings = settings;
    FX.engine?.settingsChanged();
    $('quality').value = settings.performance;
    $('gentle').checked = settings.reducedMotion;
    $('personLighting').checked = settings.personLight.on;
    document.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed',
      String(S.ELEMENTS.every(key => settings.elements[key].color === S.PRESETS[button.dataset.palette][key]))));
    store?.save(settings).catch(() => { $('tracking').textContent = 'Preview works; preferences could not be saved.'; });
  }

  for (const [name, palette] of Object.entries(S.PRESETS)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'palette'; button.dataset.palette = name;
    const dot = document.createElement('i'); dot.style.background = palette.glow;
    button.append(dot, document.createTextNode(name));
    button.addEventListener('click', () => { settings = S.applyPreset(settings, name); applySettings(); });
    $('palettes').append(button);
  }
  $('quality').addEventListener('change', () => { settings.performance = $('quality').value; applySettings(); });
  $('gentle').addEventListener('change', () => { settings.reducedMotion = $('gentle').checked; applySettings(); });
  $('personLighting').addEventListener('change', () => { settings.personLight.on = $('personLighting').checked; applySettings(); });

  function toggle() {
    active = !active;
    renderer.setActive(active);
    if (FX.engine && FX.engine.stats().active !== active) FX.engine.toggle();
    $('toggleEffect').textContent = active ? 'Pause the light' : 'Turn on the light';
  }
  $('toggleEffect').addEventListener('click', toggle);
  window.addEventListener('keydown', event => {
    if (!event.repeat && event.altKey && event.shiftKey && event.code === 'KeyP') { event.preventDefault(); toggle(); }
  });

  function hand(cx, cy, side, now) {
    const points = Array.from({ length: 21 }, () => [cx, cy, 0]);
    const wave = Math.sin(now / 1600) * 0.035;
    points[0] = [cx, cy + .19, 0];
    for (let finger = 0; finger < 5; finger++) {
      const x = cx + (finger - 2) * .044 * side;
      const y = cy - Math.sin(finger / 4 * Math.PI) * .12 + wave * side;
      for (let joint = 1; joint <= 4; joint++) points[finger * 4 + joint] = [x, y + (4 - joint) * .025, 0];
    }
    return { handedness: side < 0 ? 'Left' : 'Right', landmarks: points };
  }

  function animate(now) {
    if (disposed) return;
    if (!stream) {
      ctx.fillStyle = '#101a22'; ctx.fillRect(0, 0, 1280, 720);
      const halo = ctx.createRadialGradient(640, 330, 20, 640, 360, 600);
      halo.addColorStop(0, '#223746'); halo.addColorStop(1, '#101a22');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, 1280, 720);
      const movement = Math.sin(now / 2100) * .025;
      renderer.setHands([hand(.32 + movement, .46, -1, now), hand(.68 - movement, .46, 1, now)], now);
      const effective = settings.reducedMotion ? { ...settings, elements: { ...settings.elements,
        shards: { ...settings.elements.shards, on: false }, dust: { ...settings.elements.dust, on: false } } } : settings;
      renderer.update(now, effective, 1280, 720);
      lighting.apply(ctx, 1280, 720, renderer.level(), renderer.lightSources(), effective, now);
      renderer.draw(ctx, 1280, 720);
    } else {
      const state = FX.engine?.stats();
      $('tracking').textContent = state ? `Tracking: ${state.tracking} · ${state.hands} hand(s) · ${state.tracker.delegate || 'loading model'}` : 'Camera is stopping…';
      if (!opening && state && state.active !== active) { active = state.active; $('toggleEffect').textContent = active ? 'Pause the light' : 'Turn on the light'; }
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  function countFrames() {
    if (!stream) return;
    frames += 1;
    const now = performance.now();
    if (now - lastFpsAt > 1000) { $('fps').textContent = `${Math.round(frames * 1000 / (now - lastFpsAt))} FPS`; frames = 0; lastFpsAt = now; }
    frameCallback = video.requestVideoFrameCallback(countFrames);
  }

  async function startCamera() {
    if (stream || opening) return;
    opening = true;
    $('startCamera').disabled = true;
    let raw;
    try {
      if (!FX.isSupported()) throw new Error('This browser does not support camera processing. Try current Chrome or Edge.');
      raw = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
      if (disposed) { raw.getTracks().forEach(track => track.stop()); return; }
      stream = FX.wrapStream(raw);
      video.srcObject = stream;
      await video.play();
      if (FX.engine.stats().active !== active) FX.engine.toggle();
      canvas.hidden = true; video.hidden = false;
      $('startCamera').hidden = true; $('stopCamera').hidden = false;
      $('personLighting').disabled = false;
      $('mode').textContent = 'YOUR CAMERA · LOCAL TRACKING';
      frames = 0; lastFpsAt = performance.now();
      frameCallback = video.requestVideoFrameCallback(countFrames);
    } catch (error) {
      raw?.getTracks().forEach(track => track.stop());
      stopCamera();
      $('tracking').textContent = error.name === 'NotAllowedError' ? 'Camera permission was declined. The simulated preview still works.' : error.message;
    } finally { opening = false; $('startCamera').disabled = false; }
  }

  function stopCamera() {
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    video.srcObject = null;
    if (frameCallback !== null) video.cancelVideoFrameCallback(frameCallback);
    frameCallback = null;
    video.hidden = true; canvas.hidden = false;
    $('startCamera').hidden = false; $('stopCamera').hidden = true;
    $('personLighting').disabled = true;
    $('mode').textContent = 'SIMULATED HANDS · CAMERA OFF';
    $('fps').textContent = 'LIVE PREVIEW';
    $('tracking').textContent = 'No camera or microphone is being used.';
    renderer.setActive(active);
  }
  $('startCamera').addEventListener('click', startCamera);
  $('stopCamera').addEventListener('click', stopCamera);
  window.addEventListener('pagehide', () => { disposed = true; stopCamera(); }, { once: true });
  if (store) store.load().then(value => { settings = value; applySettings(); }).catch(() => { FX.settings = settings; });
  else applySettings();
})();
