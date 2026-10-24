// One shared engine per page: tracker + clap detection + renderer + lighting +
// on/off state. Meet can open the camera more than once (preview, call), and
// every processed track draws from this same state.
(() => {
  const FX = (globalThis.__plexusFx = globalThis.__plexusFx || {});
  const S = globalThis.__plexusSettings;

  const DETECT_INTERVAL_MS = 40; // ~25 tracking updates per second

  const currentSettings = () => FX.settings || S.DEFAULTS;

  function createEngine(baseUrl) {
    const renderer = FX.createPlexusRenderer();
    const lighting = FX.createLighting();
    const clap = FX.createClapDetector();
    const doubleClap = FX.createDoubleClap();
    const stats = { active: false, hands: 0, claps: 0, toggles: 0, lastResultAt: 0, tracking: 'loading' };
    let aspect = 16 / 9;
    let lastSubmit = -Infinity;
    let stopAudio = null;
    let audioSource = null;

    const publish = () => FX.notifyState?.({ active: stats.active, engine: true, tracking: stats.tracking });

    function setActive(on) {
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
      stats.hands = hands.length;
      stats.lastResultAt = now;
      renderer.setHands(hands, now);
      if (mask) lighting.setMask(mask, now);
      if (clap.update(hands, now, aspect)) onClap(now, 'camera');
    }

    function onTrackerStatus(kind, detail) {
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
      aspect = frame.displayWidth / frame.displayHeight;
      if (now - lastSubmit < DETECT_INTERVAL_MS) return Promise.resolve();
      lastSubmit = now;
      const wantMask = currentSettings().personLight.on && (stats.active || renderer.level() > 0);
      return tracker.submit(frame, wantMask);
    }

    // Re-evaluate the mic listener (source changed or the setting flipped).
    function refreshAudio() {
      if (stopAudio) stopAudio();
      stopAudio = null;
      const usable = audioSource && audioSource.readyState !== 'ended' && currentSettings().clapSound;
      if (!usable) return;
      try {
        stopAudio = FX.listenForTransients(audioSource.clone(), (now) => {
          if (clap.confirmAudio(now)) onClap(now, 'sound');
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
      renderer.update(now, currentSettings(), w, h);
    }

    function paint(ctx, w, h, now) {
      lighting.apply(ctx, w, h, renderer.level(), renderer.lightSources(), currentSettings(), now);
      renderer.draw(ctx, w, h);
    }

    publish();
    return {
      onFrame,
      tick,
      paint,
      isIdle: () => renderer.isIdle(),
      toggle,
      attachAudio,
      refreshAudio,
      stats: () => ({ ...stats, tracker: tracker.status() }),
    };
  }

  FX.getEngine = () => {
    if (!FX.engine) {
      const base = document.documentElement.dataset.plexusBase;
      if (!base) throw new Error('Meet Plexus: extension base URL missing');
      FX.engine = createEngine(base);
      if (FX.audioSource) FX.engine.attachAudio(FX.audioSource);
    }
    return FX.engine;
  };
})();
