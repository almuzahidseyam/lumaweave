// Listens to a clone of the microphone for sharp, loud transients. These only
// count as claps when a hand was in view, and it takes two claps to toggle, so
// speech or desk bumps alone never toggle the effect.
(() => {
  const FX = (globalThis.__plexusFx = globalThis.__plexusFx || {});

  const POLL_MS = 20;
  const PEAK_MIN = 0.28;
  const RISE_FACTOR = 4;
  const REFRACTORY_MS = 150;

  function listenForTransients(track, onTransient) {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let baseline = 0.02;
    let lastHit = -Infinity;

    const timer = setInterval(() => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      let energy = 0;
      for (let i = 0; i < buf.length; i += 1) {
        const v = Math.abs(buf[i]);
        if (v > peak) peak = v;
        energy += v * v;
      }
      const rms = Math.sqrt(energy / buf.length);
      const now = performance.now();
      if (peak >= PEAK_MIN && rms > baseline * RISE_FACTOR && now - lastHit > REFRACTORY_MS) {
        lastHit = now;
        onTransient(now);
      }
      baseline = baseline * 0.95 + rms * 0.05;
    }, POLL_MS);

    return () => {
      clearInterval(timer);
      track.stop();
      ctx.close().catch(() => {});
    };
  }

  FX.listenForTransients = listenForTransients;
})();
