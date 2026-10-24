// Listens to a clone of the microphone for sharp, loud transients. These only
// count as claps when a hand was in view, and it takes two claps to toggle, so
// speech or desk bumps alone never toggle the effect.
(() => {
  const FX = (globalThis.__lumaweaveFx = globalThis.__lumaweaveFx || {});

  const POLL_MS = 20;
  const PEAK_MIN = 0.28;
  const RISE_FACTOR = 4;
  const REFRACTORY_MS = 150;

  function listenForTransients(sourceTrack, onTransient) {
    let track, ctx, source, analyser;
    try {
      ctx = new AudioContext();
      track = sourceTrack.clone();
      source = ctx.createMediaStreamSource(new MediaStream([track]));
      analyser = ctx.createAnalyser();
    } catch (error) {
      track?.stop();
      ctx?.close().catch(() => {});
      throw error;
    }
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let baseline = 0.02;
    let lastHit = -Infinity;

    const timer = setInterval(() => {
      if (sourceTrack.readyState === 'ended') { stop(); return; }
      track.enabled = sourceTrack.enabled && !sourceTrack.muted;
      if (!track.enabled) return;
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

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      sourceTrack.removeEventListener('ended', stop);
      source.disconnect();
      analyser.disconnect();
      track.stop();
      ctx.close().catch(() => {});
    };
    sourceTrack.addEventListener('ended', stop, { once: true });
    return stop;
  }

  FX.listenForTransients = listenForTransients;
})();
