// Small status pill in the corner of the Meet page (not in the video) so it is
// obvious which stage the extension reached: loaded, camera captured, hand
// tracking ready, effect on/off, or what failed.
(() => {
  const FX = (globalThis.__plexusFx = globalThis.__plexusFx || {});

  const HIDE_AFTER_MS = 6000;
  const TONES = {
    info: '#5b4a8a',
    ok: '#2f7d4f',
    on: '#8a5cff',
    error: '#b3261e',
  };

  let pill = null;
  let hideTimer = null;

  function ensurePill() {
    if (pill && pill.isConnected) return pill;
    pill = document.createElement('div');
    pill.setAttribute('role', 'status');
    pill.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:12px', 'z-index:2147483647',
      'padding:6px 12px', 'border-radius:999px', 'color:#fff',
      'font:500 12px/1.4 system-ui,sans-serif', 'box-shadow:0 2px 8px rgba(0,0,0,.35)',
      'pointer-events:none', 'transition:opacity .4s', 'max-width:70vw',
    ].join(';');
    (document.body || document.documentElement).appendChild(pill);
    return pill;
  }

  // sticky: keep visible (errors and "waiting" states); otherwise fade out.
  FX.showStatus = (text, tone = 'info', sticky = false) => {
    const el = ensurePill();
    el.textContent = `Meet Plexus · ${text}`;
    el.style.background = TONES[tone] || TONES.info;
    el.style.opacity = '1';
    clearTimeout(hideTimer);
    if (!sticky) hideTimer = setTimeout(() => { el.style.opacity = '0'; }, HIDE_AFTER_MS);
  };
})();
