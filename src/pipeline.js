// Turns a camera track into a processed track using insertable streams. This is
// driven by camera frames rather than requestAnimationFrame, so the effect keeps
// running when the Meet tab is in the background.
(() => {
  const FX = (globalThis.__plexusFx = globalThis.__plexusFx || {});

  FX.isSupported = () =>
    typeof MediaStreamTrackProcessor === 'function' &&
    typeof MediaStreamTrackGenerator === 'function' &&
    typeof OffscreenCanvas === 'function';

  // Make the generated track look like the camera to Meet (device id, label,
  // constraints) and release the camera when Meet stops it.
  function mirrorSource(out, src) {
    const stopOut = out.stop.bind(out);
    Object.defineProperties(out, {
      label: { get: () => src.label, configurable: true },
      stop: {
        value: () => {
          src.stop();
          stopOut();
        },
        configurable: true,
      },
      getSettings: {
        value: () => ({ ...src.getSettings() }),
        configurable: true,
      },
      getCapabilities: {
        value: () => (src.getCapabilities ? src.getCapabilities() : {}),
        configurable: true,
      },
      getConstraints: { value: () => src.getConstraints(), configurable: true },
      applyConstraints: { value: (c) => src.applyConstraints(c), configurable: true },
    });
    src.addEventListener('ended', () => stopOut());
    return out;
  }

  function processVideoTrack(src, engine) {
    const processor = new MediaStreamTrackProcessor({ track: src });
    const generator = new MediaStreamTrackGenerator({ kind: 'video' });
    let canvas = null;
    let ctx = null;

    const transformer = new TransformStream({
      async transform(frame, controller) {
        const now = performance.now();
        try {
          const w = frame.displayWidth;
          const h = frame.displayHeight;
          await engine.onFrame(frame, now);
          engine.tick(now, w, h);
          if (engine.isIdle()) {
            controller.enqueue(frame);
            return;
          }
          if (!canvas || canvas.width !== w || canvas.height !== h) {
            canvas = new OffscreenCanvas(w, h);
            ctx = canvas.getContext('2d');
          }
          ctx.drawImage(frame, 0, 0, w, h);
          engine.paint(ctx, w, h, now);
          const out = new VideoFrame(canvas, { timestamp: frame.timestamp });
          frame.close();
          controller.enqueue(out);
        } catch (error) {
          // Never break the user's camera: fall back to the untouched frame.
          try {
            controller.enqueue(frame);
          } catch (closed) {
            /* frame already consumed */
          }
        }
      },
    });

    processor.readable.pipeThrough(transformer).pipeTo(generator.writable).catch(() => {});
    return mirrorSource(generator, src);
  }

  FX.wrapStream = (stream) => {
    const engine = FX.getEngine();
    const audio = stream.getAudioTracks();
    if (audio.length) {
      FX.audioSource = audio[0];
      engine.attachAudio(audio[0]);
    }
    const video = stream.getVideoTracks().map((t) => processVideoTrack(t, engine));
    return new MediaStream([...audio, ...video]);
  };
})();
