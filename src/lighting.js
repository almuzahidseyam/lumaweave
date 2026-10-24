// Lighting pass applied to the camera footage underneath the plexus:
//  - darken: dims the footage while the effect is on so the glow pops;
//  - light spill: the web's glow color washes onto nearby footage like a real
//    light source (soft-light tint plus a little additive bloom);
//  - person light (optional): with a person mask from the segmenter, the
//    background is dimmed more than you, and the glow lights your body with a
//    rim light along your silhouette.
(() => {
  const FX = (globalThis.__plexusFx = globalThis.__plexusFx || {});
  const { rgb } = globalThis.__plexusSettings;

  const LAYER_SCALE = 0.5; // light layers are rendered at half resolution
  const MASK_STALE_MS = 700;

  function layer(prev, w, h) {
    if (prev && prev.canvas.width === w && prev.canvas.height === h) return prev;
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d') };
  }

  function createLighting() {
    let light = null;
    let body = null;
    let rim = null;
    let mask = null;
    let maskAt = -Infinity;

    // mask: { width, height, data: ArrayBuffer } RGBA, alpha = person confidence.
    function setMask(next, now) {
      if (!next || !next.data) return;
      mask = layer(mask, next.width, next.height);
      mask.ctx.putImageData(new ImageData(new Uint8ClampedArray(next.data), next.width, next.height), 0, 0);
      maskAt = now;
    }

    function paintLight(target, sources, colorRgb) {
      const { ctx, canvas } = target;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      sources.forEach((s) => {
        const x = s.x * LAYER_SCALE;
        const y = s.y * LAYER_SCALE;
        const r = s.r * LAYER_SCALE;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${colorRgb}, ${0.4 * s.a})`);
        g.addColorStop(1, `rgba(${colorRgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });
      ctx.globalCompositeOperation = 'source-over';
    }

    function darken(ctx, w, h, amount, usePerson) {
      if (amount <= 0) return;
      if (!usePerson) {
        ctx.fillStyle = `rgba(0, 0, 0, ${amount})`;
        ctx.fillRect(0, 0, w, h);
        return;
      }
      // Background darker than the person: a shade layer with the person cut out.
      const shade = body;
      shade.ctx.clearRect(0, 0, shade.canvas.width, shade.canvas.height);
      shade.ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, amount * 1.6)})`;
      shade.ctx.fillRect(0, 0, shade.canvas.width, shade.canvas.height);
      shade.ctx.globalCompositeOperation = 'destination-out';
      shade.ctx.globalAlpha = 0.6;
      shade.ctx.drawImage(mask.canvas, 0, 0, shade.canvas.width, shade.canvas.height);
      shade.ctx.globalAlpha = 1;
      shade.ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(shade.canvas, 0, 0, w, h);
    }

    function personLight(ctx, w, h, strength) {
      const lw = light.canvas.width;
      const lh = light.canvas.height;
      // Body wash: the light layer, only where the person is.
      body.ctx.clearRect(0, 0, lw, lh);
      body.ctx.drawImage(light.canvas, 0, 0);
      body.ctx.globalCompositeOperation = 'destination-in';
      body.ctx.drawImage(mask.canvas, 0, 0, lw, lh);
      body.ctx.globalCompositeOperation = 'source-over';

      // Rim: mask minus a blurred mask leaves a band just inside the silhouette,
      // then tinted by the light layer so only edges near the glow light up.
      rim.ctx.clearRect(0, 0, lw, lh);
      rim.ctx.drawImage(mask.canvas, 0, 0, lw, lh);
      rim.ctx.globalCompositeOperation = 'destination-out';
      rim.ctx.filter = `blur(${Math.max(2, Math.round(lw * 0.012))}px)`;
      rim.ctx.drawImage(mask.canvas, 0, 0, lw, lh);
      rim.ctx.filter = 'none';
      rim.ctx.globalCompositeOperation = 'source-in';
      rim.ctx.drawImage(light.canvas, 0, 0);
      rim.ctx.globalCompositeOperation = 'source-over';

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, strength * 0.9);
      ctx.drawImage(body.canvas, 0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, strength * 1.6);
      ctx.drawImage(rim.canvas, 0, 0, w, h);
      ctx.restore();
    }

    // level: 0..1 effect fade. sources: [{ x, y, r, a }] in frame pixels.
    function apply(ctx, w, h, level, sources, settings, now) {
      if (level <= 0) return;
      const lw = Math.max(1, Math.round(w * LAYER_SCALE));
      const lh = Math.max(1, Math.round(h * LAYER_SCALE));
      light = layer(light, lw, lh);
      body = layer(body, lw, lh);
      rim = layer(rim, lw, lh);
      const usePerson = settings.personLight.on && mask !== null && now - maskAt < MASK_STALE_MS;

      darken(ctx, w, h, (settings.darken / 100) * level, usePerson);
      if (!sources.length) return;

      paintLight(light, sources, rgb(settings.elements.glow.color));
      if (settings.lightSpill.on) {
        const k = (settings.lightSpill.strength / 100) * level;
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = Math.min(1, k * 1.4);
        ctx.drawImage(light.canvas, 0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * 0.15;
        ctx.drawImage(light.canvas, 0, 0, w, h);
        ctx.restore();
      }
      if (usePerson) personLight(ctx, w, h, (settings.personLight.strength / 100) * level);
    }

    return { apply, setMask };
  }

  FX.createLighting = createLighting;
})();
