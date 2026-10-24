// Plexus renderer: glowing strings between fingertips, translucent facets,
// drifting satellite nodes, shattering shards and dissolving dust. Every
// element has its own color and on/off switch from the settings.
(() => {
  const FX = (globalThis.__lumaweaveFx = globalThis.__lumaweaveFx || {});
  const { rgb } = globalThis.__lumaweaveSettings;

  const TIP_IDS = [4, 8, 12, 16, 20];
  const PALM_IDS = [0, 5, 9, 17];
  const SATELLITES = 7;
  const SMOOTHING = 0.55; // 0 = frozen, 1 = raw landmarks
  const FADE_MS = 450;
  const HAND_TIMEOUT_MS = 350;
  const DUST_PER_SECOND = 220; // shed from the web while it is on
  const DISSOLVE_DUST = 650; // released when the web turns off

  const lerp = (a, b, t) => a + (b - a) * t;
  const avg = (pts) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const toPoint = (lm) => ({ x: lm[0], y: lm[1] });

  function smoothHand(prev, landmarks, now) {
    const rawTips = TIP_IDS.map((i) => toPoint(landmarks[i]));
    const palm = avg(PALM_IDS.map((i) => toPoint(landmarks[i])));
    const size = dist(toPoint(landmarks[0]), toPoint(landmarks[9]));
    if (!prev) return { tips: rawTips, palm, size, seenAt: now, speed: 0, vis: 0 };
    const tips = rawTips.map((p, i) => ({
      x: lerp(prev.tips[i].x, p.x, SMOOTHING),
      y: lerp(prev.tips[i].y, p.y, SMOOTHING),
    }));
    const moved = tips.reduce((s, p, i) => s + dist(p, prev.tips[i]), 0) / tips.length;
    return {
      tips,
      palm: { x: lerp(prev.palm.x, palm.x, SMOOTHING), y: lerp(prev.palm.y, palm.y, SMOOTHING) },
      size: lerp(prev.size, size, SMOOTHING),
      seenAt: now,
      speed: lerp(prev.speed, moved, 0.5),
      vis: prev.vis,
    };
  }

  function satellites(hand, idx, now, w, h) {
    const r = hand.size * Math.min(w, h) * 1.1;
    const cx = hand.palm.x * w;
    const cy = hand.palm.y * h;
    return Array.from({ length: SATELLITES }, (_, i) => {
      const phase = (now / 1000) * (0.5 + i * 0.13) + i * 2.1 + idx * 1.7;
      const rr = r * (0.55 + 0.45 * Math.sin(phase * 1.3));
      return { x: cx + Math.cos(phase) * rr, y: cy + Math.sin(phase * 0.9) * rr };
    });
  }

  // All pixel-space geometry for one frame: tips, satellites, line segments
  // [a, b, alpha] and facets [a, b, c, alpha].
  function buildGeometry(handList, level, now, w, h) {
    const tipSets = handList.map((hand) => hand.tips.map((p) => ({ x: p.x * w, y: p.y * h })));
    const palms = handList.map((hand) => ({ x: hand.palm.x * w, y: hand.palm.y * h }));
    const sats = handList.flatMap((hand, i) => satellites(hand, i, now, w, h));
    const handAlpha = handList.map((hand) => level * hand.vis);
    const webAlpha = level * Math.min(1, ...handList.map((hand) => hand.vis));
    const segments = [];
    const facets = [];

    if (tipSets.length >= 2) {
      const [l, r] = tipSets;
      for (let i = 0; i < TIP_IDS.length - 1; i += 1) {
        facets.push([l[i], l[i + 1], r[i + 1], 0.2 * webAlpha]);
        facets.push([l[i], r[i + 1], r[i], 0.13 * webAlpha]);
        segments.push([l[i], r[i + 1], 0.35 * webAlpha]);
      }
      l.forEach((p, i) => segments.push([p, r[i], 0.9 * webAlpha]));
    }
    tipSets.forEach((tips, hi) => {
      for (let i = 0; i < tips.length - 1; i += 1) {
        facets.push([palms[hi], tips[i], tips[i + 1], (tipSets.length >= 2 ? 0.07 : 0.16) * handAlpha[hi]]);
        segments.push([tips[i], tips[i + 1], 0.75 * handAlpha[hi]]);
      }
    });

    // Classic lumaweave: link any nodes that drift close to each other.
    const nodes = [...tipSets.flat(), ...sats];
    const maxD = Math.min(w, h) * 0.24;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const d = dist(nodes[i], nodes[j]);
        if (d < maxD) segments.push([nodes[i], nodes[j], (1 - d / maxD) * 0.3 * level]);
      }
    }
    return { tipSets, palms, sats, segments, facets, handAlpha, sizes: handList.map((x) => x.size) };
  }

  function createWeaveRenderer() {
    const particles = FX.createParticles();
    let hands = new Map(); // handedness -> smoothed hand (normalized coords)
    let level = 0; // 0..1 fade of the whole web
    let target = 0;
    let lastTick = null;
    let frame = { w: 1280, h: 720 };
    let geom = buildGeometry([], 0, 0, frame.w, frame.h);
    let settings = globalThis.__lumaweaveSettings.DEFAULTS;

    const scale = () => Math.min(frame.w, frame.h);
    const els = () => settings.elements;

    function setHands(detected, now) {
      const next = new Map();
      detected.forEach((h, idx) => {
        const dup = detected.length === 2 && detected[0].handedness === detected[1].handedness;
        const key = dup ? `${h.handedness}${idx}` : h.handedness;
        next.set(key, smoothHand(hands.get(key), h.landmarks, now));
      });
      // Keep briefly-lost hands so the web does not flicker.
      hands.forEach((h, key) => {
        if (!next.has(key) && now - h.seenAt < HAND_TIMEOUT_MS) next.set(key, h);
      });
      hands = next;
    }

    function setActive(on) {
      target = on ? 1 : 0;
      const origins = geom.tipSets.flat();
      const center = [{ x: frame.w / 2, y: frame.h / 2 }];
      if (els().shards.on) particles.burstShards(origins.length ? origins : center, scale(), on ? 60 : 90);
      // Turning off: the whole web crumbles into dust.
      if (!on && els().dust.on) particles.dustAlong(geom.segments, DISSOLVE_DUST, scale(), true);
    }

    function update(now, nextSettings, w, h) {
      settings = nextSettings;
      frame = { w, h };
      const dt = lastTick === null ? 0 : Math.min((now - lastTick) / 1000, 0.1);
      lastTick = now;
      const step = (dt * 1000) / FADE_MS;
      level = target > level ? Math.min(target, level + step) : Math.max(target, level - step);

      hands = new Map(
        [...hands]
          .filter(([, hd]) => now - hd.seenAt < HAND_TIMEOUT_MS)
          .map(([k, hd]) => {
            const visible = now - hd.seenAt < 120 ? 1 : 0;
            return [k, { ...hd, vis: lerp(hd.vis, visible, Math.min(1, dt * 8)) }];
          }),
      );
      const list = [...hands.values()].sort((a, b) => a.palm.x - b.palm.x);
      geom = buildGeometry(list, level, now, w, h);

      if (target === 1 && dt > 0) {
        if (els().dust.on) {
          const n = Math.floor(DUST_PER_SECOND * dt + Math.random());
          particles.dustAlong(geom.segments, n, scale());
        }
        // Fast-moving fingertips shed shards and a puff of dust.
        list.forEach((hand, i) => {
          if (hand.speed > 0.012 && Math.random() < hand.speed * 25) {
            const tip = geom.tipSets[i][Math.floor(Math.random() * TIP_IDS.length)];
            if (els().shards.on) particles.shedShard(tip.x, tip.y, scale());
            if (els().dust.on) particles.dustAt([tip], 6, scale());
          }
        });
      }
      particles.update(dt, scale(), now);
    }

    function isIdle() {
      return level === 0 && target === 0 && particles.count() === 0;
    }

    // Light emitters for the lighting pass: fingertips, palms, facet centers.
    function lightSources() {
      if (level === 0) return [];
      const s = scale();
      const tips = geom.tipSets.flatMap((tips, hi) =>
        tips.map((p) => ({ x: p.x, y: p.y, r: s * 0.12, a: geom.handAlpha[hi] })));
      const palms = geom.palms.map((p, hi) => ({
        x: p.x, y: p.y, r: Math.max(s * 0.18, geom.sizes[hi] * s * 2.2), a: geom.handAlpha[hi] * 0.8,
      }));
      return [...tips, ...palms];
    }

    function fill(ctx, [a, b, c, alpha], fromRgb, toRgb) {
      const g = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
      g.addColorStop(0, `rgba(${fromRgb}, ${alpha})`);
      g.addColorStop(1, `rgba(${toRgb}, ${alpha * 0.45})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
    }

    function stroke(ctx, segments, color, width, alphaScale) {
      segments.forEach(([a, b, alpha]) => {
        ctx.strokeStyle = `rgba(${color}, ${alpha * alphaScale})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    }

    function node(ctx, p, radius, alpha, coreRgb, haloRgb, unit, halo) {
      if (halo) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 4);
        g.addColorStop(0, `rgba(${haloRgb}, ${alpha * 0.5})`);
        g.addColorStop(1, `rgba(${haloRgb}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${coreRgb}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(radius, unit), 0, Math.PI * 2);
      ctx.fill();
    }

    function drawWeb(ctx, unit) {
      if (level === 0 || !geom.tipSets.length) return;
      const e = els();
      const glowRgb = rgb(e.glow.color);
      if (e.triangles.on) {
        const triRgb = rgb(e.triangles.color);
        geom.facets.forEach((f) => fill(ctx, f, triRgb, glowRgb));
      }
      if (e.glow.on) stroke(ctx, geom.segments, glowRgb, 6 * unit, 0.2);
      if (e.lines.on) stroke(ctx, geom.segments, rgb(e.lines.color), 1.4 * unit, 1);
      if (e.nodes.on) {
        const nodeRgb = rgb(e.nodes.color);
        geom.sats.forEach((p) => node(ctx, p, 1.6 * unit, 0.6 * level, nodeRgb, glowRgb, unit, e.glow.on));
        geom.tipSets.forEach((tips, hi) =>
          tips.forEach((p) => node(ctx, p, 3.2 * unit, geom.handAlpha[hi], nodeRgb, glowRgb, unit, e.glow.on)));
      }
    }

    function draw(ctx, w, h) {
      const unit = Math.min(w, h) / 720;
      const e = els();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawWeb(ctx, unit);
      if (e.dust.on) particles.drawDust(ctx, unit, rgb(e.dust.color));
      ctx.globalCompositeOperation = 'source-over';
      if (e.shards.on) particles.drawShards(ctx, unit, rgb(e.shards.color), rgb(e.triangles.color));
      ctx.restore();
    }

    return { setHands, setActive, update, draw, isIdle, lightSources, level: () => level };
  }

  FX.createWeaveRenderer = createWeaveRenderer;
})();
