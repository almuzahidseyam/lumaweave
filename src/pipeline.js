// Camera-driven rendering with explicit ownership of frames, source tracks and clones.
(() => {
  const FX = (globalThis.__lumaweaveFx = globalThis.__lumaweaveFx || {});
  FX.isSupported = () => typeof MediaStreamTrackProcessor === 'function' &&
    typeof MediaStreamTrackGenerator === 'function' && typeof OffscreenCanvas === 'function';

  function processVideoTrack(src, engine) {
    const processor = new MediaStreamTrackProcessor({ track: src });
    const generator = new MediaStreamTrackGenerator({ kind: 'video' });
    const abort = new AbortController();
    const consumers = new Map();
    let canvas, ctx;
    let released = false;
    engine.acquire();

    function release() {
      if (released) return;
      released = true;
      src.removeEventListener('ended', release);
      abort.abort();
      src.stop();
      for (const stop of consumers.values()) stop();
      consumers.clear();
      engine.release();
    }

    function mirror(track) {
      const nativeStop = track.stop.bind(track);
      const nativeClone = track.clone.bind(track);
      let stopped = false;
      function stop() {
        if (stopped) return;
        stopped = true;
        nativeStop();
        consumers.delete(track);
        if (!consumers.size) release();
      }
      consumers.set(track, nativeStop);
      track.addEventListener('ended', stop, { once: true });
      Object.defineProperties(track, {
        label: { get: () => src.label, configurable: true },
        stop: { value: stop, configurable: true },
        clone: { value: () => {
          const cloned = mirror(nativeClone());
          if (released) cloned.stop();
          return cloned;
        }, configurable: true },
        getSettings: { value: () => ({ ...src.getSettings() }), configurable: true },
        getCapabilities: { value: () => src.getCapabilities?.() || {}, configurable: true },
        getConstraints: { value: () => src.getConstraints(), configurable: true },
        applyConstraints: { value: constraints => src.applyConstraints(constraints), configurable: true },
      });
      return track;
    }

    const transformer = new TransformStream({
      async transform(frame, controller) {
        let output;
        try {
          const now = performance.now();
          const w = frame.displayWidth, h = frame.displayHeight;
          await engine.onFrame(frame, now);
          if (released) { frame.close(); return; }
          engine.tick(now, w, h);
          if (engine.isIdle()) { controller.enqueue(frame); return; }
          if (!canvas || canvas.width !== w || canvas.height !== h) {
            canvas = new OffscreenCanvas(w, h);
            ctx = canvas.getContext('2d');
          }
          ctx.save();
          try {
            ctx.drawImage(frame, 0, 0, w, h);
            engine.paint(ctx, w, h, now);
          } finally { ctx.restore(); }
          output = new VideoFrame(canvas, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
          controller.enqueue(output);
          output = null; // the writable stream now owns this frame
          frame.close();
        } catch {
          output?.close();
          try { controller.enqueue(frame); } catch { frame.close(); }
        }
      },
    });
    src.addEventListener('ended', release, { once: true });
    const output = mirror(generator);
    processor.readable.pipeThrough(transformer, { signal: abort.signal })
      .pipeTo(generator.writable, { signal: abort.signal }).catch(() => {}).finally(release);
    return output;
  }

  FX.wrapStream = stream => {
    const originals = stream.getVideoTracks();
    if (!originals.length) return stream;
    const engine = FX.getEngine();
    const audio = stream.getAudioTracks();
    if (audio.length) { FX.audioSource = audio[0]; engine.attachAudio(audio[0]); }
    const video = [];
    try {
      for (const track of originals) video.push(processVideoTrack(track, engine));
      return new MediaStream([...audio, ...video]);
    } catch (error) {
      for (const track of video) track.stop();
      if (!video.length) engine.destroy();
      throw error;
    }
  };
})();