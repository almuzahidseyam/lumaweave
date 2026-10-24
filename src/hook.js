// Intercepts Meet's camera/mic requests, hands back the processed stream, and
// talks to the isolated-world bridge (settings in, on/off state out).
// Alt+Shift+P toggles the effect by keyboard as a fallback to clapping.
(() => {
  const FX = (globalThis.__lumaweaveFx = globalThis.__lumaweaveFx || {});
  const S = globalThis.__lumaweaveSettings;
  if (FX.hooked || !navigator.mediaDevices) return;

  // Every page-world module must have loaded; if one failed, say so instead of
  // silently leaving the camera unhooked.
  const REQUIRED = ['showStatus', 'createClapDetector', 'createParticles', 'createWeaveRenderer',
    'createLighting', 'createTracker', 'listenForTransients', 'getEngine', 'wrapStream'];
  const missing = [...(S ? [] : ['settings']), ...REQUIRED.filter((name) => typeof FX[name] !== 'function')];
  if (missing.length) {
    const report = () => FX.showStatus?.(`failed to load (${missing.join(', ')}); reload the extension`, 'error', true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', report, { once: true });
    else report();
    return;
  }
  FX.hooked = true;
  FX.settings = S.sanitize({});

  const original = MediaDevices.prototype.getUserMedia;

  // Meet often opens the mic before the camera: remember it either way so
  // clap sounds can be heard once the camera (and the engine) start.
  function rememberMic(stream) {
    const mic = stream.getAudioTracks()[0];
    if (!mic) return;
    FX.audioSource = mic;
    if (FX.engine) FX.engine.attachAudio(mic);
  }

  MediaDevices.prototype.getUserMedia = async function getUserMedia(constraints) {
    const stream = await original.call(this, constraints);
    try {
      const hasVideo = stream.getVideoTracks().length > 0;
      if (hasVideo && !FX.isSupported()) {
        FX.showStatus('this Chrome lacks insertable streams; effect unavailable', 'error', true);
        return stream;
      }
      if (hasVideo) return FX.wrapStream(stream);
      rememberMic(stream);
      return stream;
    } catch (error) {
      FX.showStatus(`could not process camera: ${error.message}`, 'error', true);
      return stream;
    }
  };

  function toggleOrExplain() {
    if (FX.engine) {
      FX.engine.toggle();
    } else {
      FX.showStatus('camera not captured yet: turn your camera on (reload this tab if it already is)', 'error', true);
    }
  }

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat || !(event.altKey && event.shiftKey && event.code === 'KeyP')) return;
      event.preventDefault();
      toggleOrExplain();
    },
    true,
  );

  // Bridge channel: same-window messages tagged with __lumaweave.
  const post = (type, extra = {}) => window.postMessage({ __lumaweave: type, ...extra }, location.origin);
  FX.notifyState = (state) => post('state', state);

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin || !event.data || typeof event.data.__lumaweave !== 'string') return;
    const msg = event.data;
    if (msg.__lumaweave === 'settings') {
      FX.settings = S.sanitize(msg.settings);
      FX.engine?.settingsChanged();
    }
    if (msg.__lumaweave === 'toggle') toggleOrExplain();
  });
  post('hello');
  window.addEventListener('pagehide', () => FX.engine?.destroy(), { once: true });

  const announce = () => FX.showStatus('loaded · waiting for your camera', 'info', true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announce, { once: true });
  } else {
    announce();
  }
})();
