// Particle systems in pixel space: triangle shards that shatter outward, and
// fine dust that peels off the lines and dissolves as it drifts away.
(() => {
  const FX = (globalThis.__plexusFx = globalThis.__plexusFx || {});

  const MAX_SHARDS = 220;
  const MAX_DUST = 1400;

  function makeShard(x, y, scale, burst) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (burst ? 0.25 + Math.random() * 0.9 : 0.05 + Math.random() * 0.2) * scale;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 6,
      size: (0.012 + Math.random() * (burst ? 0.05 : 0.025)) * scale,
      life: 1,
      decay: burst ? 0.55 + Math.random() * 0.6 : 0.9 + Math.random() * 0.8,
      filled: Math.random() < 0.35,
    };
  }

  // Dust starts nearly still and drifts up/outward with a gentle wobble,
  // shrinking and fading so it reads as the line dissolving into the air.
  function makeDust(x, y, scale, strong) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (strong ? 0.04 + Math.random() * 0.12 : 0.01 + Math.random() * 0.05) * scale;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.03 * scale,
      seed: Math.random() * 1000,
      size: 1.2 + Math.random() * 2.4,
      life: 1,
      decay: 0.45 + Math.random() * (strong ? 0.5 : 0.9),
    };
  }

  function pointOnSegment([a, b]) {
    const t = Math.random();
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function createParticles() {
    let shards = [];
    let dust = [];

    function burstShards(origins, scale, count) {
      const pts = origins.length ? origins : [{ x: 0, y: 0 }];
      const fresh = Array.from({ length: count }, (_, i) => {
        const o = pts[i % pts.length];
        return makeShard(o.x, o.y, scale, true);
      });
      shards = [...shards, ...fresh].slice(-MAX_SHARDS);
    }

    function shedShard(x, y, scale) {
      shards = [...shards, makeShard(x, y, scale, false)].slice(-MAX_SHARDS);
    }

    // segments: [[a, b, alpha], ...] in pixels; picks brighter ones more often.
    function dustAlong(segments, count, scale, strong = false) {
      const bright = segments.filter((s) => s[2] > 0.2);
      if (!bright.length || count <= 0) return;
      const fresh = Array.from({ length: count }, () => {
        const p = pointOnSegment(bright[Math.floor(Math.random() * bright.length)]);
        return makeDust(p.x, p.y, scale, strong);
      });
      dust = [...dust, ...fresh].slice(-MAX_DUST);
    }

    function dustAt(points, count, scale) {
      if (!points.length) return;
      const fresh = Array.from({ length: count }, () => {
        const p = points[Math.floor(Math.random() * points.length)];
        return makeDust(p.x, p.y, scale, false);
      });
      dust = [...dust, ...fresh].slice(-MAX_DUST);
    }

    function update(dt, scale, now) {
      if (dt <= 0) return;
      shards = shards
        .map((s) => ({
          ...s,
          x: s.x + s.vx * dt,
          y: s.y + s.vy * dt,
          vx: s.vx * (1 - dt * 0.6),
          vy: s.vy * (1 - dt * 0.6) + scale * 0.04 * dt,
          rot: s.rot + s.spin * dt,
          life: s.life - s.decay * dt,
        }))
        .filter((s) => s.life > 0);

      const t = now / 1000;
      dust = dust
        .map((d) => ({
          ...d,
          x: d.x + (d.vx + Math.sin(t * 2.3 + d.seed) * 0.02 * scale) * dt,
          y: d.y + (d.vy + Math.cos(t * 1.9 + d.seed) * 0.015 * scale) * dt,
          vx: d.vx * (1 - dt * 0.8),
          vy: d.vy * (1 - dt * 0.8) - 0.02 * scale * dt,
          life: d.life - d.decay * dt,
        }))
        .filter((d) => d.life > 0);
    }

    function drawShards(ctx, unit, rgb, fillRgb) {
      shards.forEach((s) => {
        const a = Math.max(0, s.life);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.beginPath();
        ctx.moveTo(0, -s.size);
        ctx.lineTo(s.size * 0.87, s.size * 0.5);
        ctx.lineTo(-s.size * 0.87, s.size * 0.5);
        ctx.closePath();
        if (s.filled) {
          ctx.fillStyle = `rgba(${fillRgb}, ${a * 0.25})`;
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(${rgb}, ${a * 0.85})`;
        ctx.lineWidth = 1.2 * unit;
        ctx.stroke();
        ctx.restore();
      });
    }

    // A faint halo plus a bright core per mote, so dust glows like the lines.
    function drawDust(ctx, unit, rgb) {
      dust.forEach((d) => {
        const a = Math.max(0, d.life);
        const s = d.size * unit * (0.4 + 0.6 * a);
        ctx.fillStyle = `rgba(${rgb}, ${a * 0.18})`;
        ctx.fillRect(d.x - s * 1.5, d.y - s * 1.5, s * 3, s * 3);
        ctx.fillStyle = `rgba(${rgb}, ${a})`;
        ctx.fillRect(d.x - s / 2, d.y - s / 2, s, s);
      });
    }

    const count = () => shards.length + dust.length;

    return { burstShards, shedShard, dustAlong, dustAt, update, drawShards, drawDust, count };
  }

  FX.createParticles = createParticles;
})();
