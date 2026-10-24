// Hand tracking runs inside a hidden extension iframe (detector/detector.html):
// Meet's page enforces Trusted Types, which blocks MediaPipe's loader, while
// extension pages allow it. Frames go in as downscaled ImageBitmaps and hand
// landmarks come back.
(() => {
  const FX = (globalThis.__lumaweaveFx = globalThis.__lumaweaveFx || {});

  const DETECT_WIDTH = 640;
  const REPLY_TIMEOUT_MS = 2000;
  const LOAD_TIMEOUT_MS = 30000;

  // onStatus(kind, detail): kind is 'ready' or 'error'.
  function createTracker(baseUrl, onHands, onStatus = () => {}) {
    const url = new URL(baseUrl);
    // URL.origin returns "null" for extension schemes in the URL parser.
    const origin = url.protocol === 'chrome-extension:' ? `${url.protocol}//${url.host}` : url.origin;
    const channel = crypto.randomUUID();
    const iframe = document.createElement('iframe');
    const frameUrl = new URL('detector/detector.html', baseUrl);
    frameUrl.hash = new URLSearchParams({ parent: location.origin, channel }).toString();
    iframe.src = frameUrl.href;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText =
      'position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none;';
    const state = { ready: false, failed: null, inflightSince: null, delegate: null, timeouts: 0 };
    let destroyed = false;
    let requestId = 0;
    const loadTimer = setTimeout(() => {
      if (!destroyed && !state.ready && !state.failed) {
        state.failed = 'hand tracker frame did not load';
        onStatus('error', state.failed);
      }
    }, LOAD_TIMEOUT_MS);

    function onMessage(event) {
      if (destroyed || event.origin !== origin || event.source !== iframe.contentWindow) return;
      const msg = event.data || {};
      if (msg.channel !== channel) return;
      if (msg.type === 'lumaweave:ready') {
        state.ready = true;
        state.failed = null;
        state.delegate = msg.delegate;
        clearTimeout(loadTimer);
        onStatus('ready', msg.delegate);
      }
      if (msg.type === 'lumaweave:error') {
        state.failed = msg.message;
        clearTimeout(loadTimer);
        onStatus('error', msg.message);
      }
      if (msg.type === 'lumaweave:hands') {
        if (msg.requestId !== requestId) return;
        state.inflightSince = null;
        state.timeouts = 0;
        const hands = Array.isArray(msg.hands) ? msg.hands.slice(0, 2).filter((hand) =>
          typeof hand?.handedness === 'string' && Array.isArray(hand.landmarks) && hand.landmarks.length === 21 &&
          hand.landmarks.every((point) => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))) : [];
        const mask = msg.mask;
        const validMask = mask && Number.isInteger(mask.width) && Number.isInteger(mask.height) &&
          mask.width > 0 && mask.height > 0 && mask.width <= 640 && mask.height <= 640 &&
          mask.data instanceof ArrayBuffer && mask.data.byteLength === mask.width * mask.height * 4;
        onHands(hands, performance.now(), validMask ? mask : null);
      }
      if (msg.type === 'lumaweave:segment-error') onStatus('segment-error', msg.message);
    }
    window.addEventListener('message', onMessage);
    document.documentElement.appendChild(iframe);

    // segment: also ask for a person mask (only needed for person lighting).
    async function submit(frame, segment = false, detectWidth = DETECT_WIDTH) {
      const now = performance.now();
      const busy = state.inflightSince !== null && now - state.inflightSince < REPLY_TIMEOUT_MS;
      if (destroyed || !state.ready || state.failed || busy || !iframe.contentWindow) return;
      if (state.inflightSince !== null) {
        state.timeouts += 1;
        if (state.timeouts >= 3) {
          state.failed = 'tracking stopped responding; restart your camera';
          onStatus('error', state.failed);
          return;
        }
      }
      state.inflightSince = now;
      const id = ++requestId;
      let bitmap = null;
      try {
        const w = frame.displayWidth;
        const h = frame.displayHeight;
        if (!(w > 0 && h > 0)) { state.inflightSince = null; return; }
        const scale = Math.min(1, detectWidth / w, 640 / h);
        bitmap = await createImageBitmap(frame, {
          resizeWidth: Math.max(1, Math.round(w * scale)),
          resizeHeight: Math.max(1, Math.round(h * scale)),
          resizeQuality: 'low',
        });
        if (destroyed) { bitmap.close(); return; }
        iframe.contentWindow.postMessage({ type: 'lumaweave:frame', bitmap, segment, channel, requestId: id }, origin, [bitmap]);
      } catch (error) {
        bitmap?.close();
        state.inflightSince = null;
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      state.ready = false;
      clearTimeout(loadTimer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    }

    return { submit, destroy, status: () => ({ ...state }) };
  }

  FX.createTracker = createTracker;
})();
