// One shared engine per page: tracker + clap detection + renderer + lighting +
// on/off state. Meet can open the camera more than once (preview, call), and
// every processed track draws from this same state.
(() => {
  const FX = (globalThis.__lumaweaveFx = globalThis.__lumaweaveFx || {});
  const S = globalThis.__lumaweaveSettings;

  const currentSettings = () => FX.settings || S.DEFAULTS;

  function createEngine(baseUrl) {
    const renderer = FX.createWeaveRenderer();
    const lighting = FX.createLighting();
    let clap = FX.createClapDetector();
    let doubleClap = FX.createDoubleClap();
    const stats = { active: false, hands: 0, claps: 0, toggles: 0, lastResultAt: 0, tracking: 'loading' };
    let aspect = 16 / 9;
    let lastSubmit = -Infinity;
    let stopAudio = null;
    let audioSource = null;
    let lastSoundSetting = currentSettings().clapSound;
    let users = 0;
    let destroyed = false;

    const publish = () => FX.notifyState?.({ active: stats.active, engine: !destroyed, tracking: stats.tracking, hands: stats.hands });

    function setActive(on) {
      if (destroyed) return;
      stats.active = on;
      stats.toggles += 1;
      renderer.setActive(on);
      const hint = on && stats.hands === 0 ? ' (no hands in view yet)' : '';
      FX.showStatus(on ? `effect ON${hint}` : 'effect OFF', on ? 'on' : 'info');
      publish();
    }

    const toggle = () => setActive(!stats.active);

    function onClap(now, source) {
      stats.claps += 1;
      const result = doubleClap.register(now);
      if (result === 'double') toggle();
      if (result === 'first') {
        FX.showStatus(`clap (${source}) · clap again to turn ${stats.active ? 'off' : 'on'}`, 'info');
      }
    }

    function onHands(hands, now, mask) {
      if (destroyed) return;
      const previousHands = stats.hands;
      stats.hands = hands.length;
      stats.lastResultAt = now;
      renderer.setHands(hands, now);
      if (mask) lighting.setMask(mask, now);
      if (clap.update(hands, now, aspect, currentSettings().clapGesture)) onClap(now, 'camera');
      if (previousHands !== stats.hands) publish();
    }

    function onTrackerStatus(kind, detail) {
      if (destroyed) return;
      if (kind === 'ready') {
        stats.tracking = 'ready';
        FX.showStatus(`hand tracking ready (${detail || 'GPU'}) · double-clap or Alt+Shift+P`, 'ok');
      } else if (kind === 'segment-error') {
        FX.showStatus(`person lighting unavailable: ${detail}`, 'error');
      } else {
        stats.tracking = 'failed';
        FX.showStatus(`hand tracking failed: ${detail}`, 'error', true);
      }
      publish();
    }

    FX.showStatus('camera captured · loading hand tracking…', 'info', true);
    const tracker = FX.createTracker(baseUrl, onHands, onTrackerStatus);

    function onFrame(frame, now) {
      if (destroyed) return;
      aspect = frame.displayWidth / frame.displayHeight;
      const profile = S.PROFILES[currentSettings().performance] || S.PROFILES.balanced;
      if (now - lastSubmit < profile.interval) return Promise.resolve();
      lastSubmit = now;
      const wantMask = currentSettings().personLight.on && (stats.active || renderer.level() > 0);
      return tracker.submit(frame, wantMask, profile.width);
    }

    // Re-evaluate the mic listener (source changed or the setting flipped).
    function refreshAudio() {
      lastSoundSetting = currentSettings().clapSound;
      if (stopAudio) stopAudio();
      stopAudio = null;
      const usable = !destroyed && audioSource && audioSource.readyState !== 'ended' && currentSettings().clapSound;
      if (!usable) return;
      try {
        stopAudio = FX.listenForTransients(audioSource, (now) => {
          if (!destroyed && currentSettings().clapSound && clap.confirmAudio(now)) onClap(now, 'sound');
        });
      } catch (error) {
        stopAudio = null;
      }
    }

    function attachAudio(track) {
      audioSource = track;
      refreshAudio();
    }

    function tick(now, w, h) {
      if (stats.hands && now - stats.lastResultAt > 600) {
        stats.hands = 0;
        renderer.setHands([], now);
        publish();
      }
      const settings = currentSettings();
      const effective = settings.reducedMotion ? { ...settings, elements: { ...settings.elements,
        shards: { ...settings.elements.shards, on: false }, dust: { ...settings.elements.dust, on: false } } } : settings;
      renderer.update(now, effective, w, h);
    }

    function paint(ctx, w, h, now) {
      lighting.apply(ctx, w, h, renderer.level(), renderer.lightSources(), currentSettings(), now);
      renderer.draw(ctx, w, h);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopAudio?.();
      stopAudio = null;
      audioSource = null;
      tracker.destroy();
      stats.active = false;
      stats.hands = 0;
      stats.tracking = 'camera off';
      if (FX.engine === engine) FX.engine = null;
      publish();
    }

    function settingsChanged() {
      clap = FX.createClapDetector();
      doubleClap = FX.createDoubleClap();
      if (lastSoundSetting !== currentSettings().clapSound) refreshAudio();
      publish();
    }

    const engine = {
      onFrame,
      tick,
      paint,
      isIdle: () => renderer.isIdle(),
      toggle,
      attachAudio,
      refreshAudio,
      settingsChanged,
      acquire: () => { users += 1; },
      release: () => { users = Math.max(0, users - 1); if (!users) destroy(); },
      destroy,
      stats: () => ({ ...stats, tracker: tracker.status() }),
    };
    publish();
    return engine;
  }

  FX.getEngine = () => {
    if (!FX.engine) {
      const base = document.documentElement.dataset.lumaweaveBase;
      if (!base) throw new Error('LumaWeave: extension base URL missing');
      FX.engine = createEngine(base);
      if (FX.audioSource) FX.engine.attachAudio(FX.audioSource);
    }
    return FX.engine;
  };
})();
