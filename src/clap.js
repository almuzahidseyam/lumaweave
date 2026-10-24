// Clap detection. Single claps come from two sources:
//  - camera: palms that were apart meet quickly (distances in "hand sizes", so
//    it works at any distance), unless the hands cross over (arms crossing);
//  - sound: a sharp transient from the mic while a hand was recently in view.
// A double clap (two single claps in quick succession) toggles the effect, so
// single-clap detection can stay forgiving without random toggles.
(() => {
  const FX = (globalThis.__plexusFx = globalThis.__plexusFx || {});

  const PALM_IDS = [0, 5, 9, 13, 17];

  const DEFAULTS = {
    apartRatio: 1.3, // palms at least this many hand-sizes apart...
    touchRatio: 0.9, // ...then closer than this...
    windowMs: 600, // ...within this time window
    confirmMs: 100, // touch becomes a clap unless the hands cross over by then
    maxTiltDeg: 75, // neither hand pointing down or fully flat at contact
    lostCloseRatio: 1.2, // tracking lost while palms were this close counts as contact
    lostGraceMs: 200,
    audioHandsMs: 700, // a clap sound counts if a hand was seen this recently
    cooldownMs: 220, // two detections closer than this are the same clap
  };

  const DOUBLE_DEFAULTS = {
    minGapMs: 150, // faster than this is one clap detected twice
    maxGapMs: 900, // slower than this starts a new pair
    lockoutMs: 900, // after a toggle, ignore claps briefly
  };

  function palmCenter(lm, aspect) {
    const sum = PALM_IDS.reduce(
      (acc, i) => ({ x: acc.x + lm[i][0] * aspect, y: acc.y + lm[i][1] }),
      { x: 0, y: 0 },
    );
    return { x: sum.x / PALM_IDS.length, y: sum.y / PALM_IDS.length };
  }

  function handSize(lm, aspect) {
    return Math.hypot((lm[9][0] - lm[0][0]) * aspect, lm[9][1] - lm[0][1]);
  }

  function isUpright(lm, aspect, maxTiltDeg) {
    const up = lm[0][1] - lm[9][1];
    const side = Math.abs((lm[9][0] - lm[0][0]) * aspect);
    return (Math.atan2(side, up) * 180) / Math.PI <= maxTiltDeg;
  }

  // Palm distance in hand-sizes, which side the first hand is on, and whether
  // both hands are roughly upright; null when fewer than two hands are visible.
  function measure(hands, aspect, maxTiltDeg) {
    if (hands.length < 2) return null;
    const [a, b] = [...hands.slice(0, 2)].sort((x, y) => (x.handedness < y.handedness ? -1 : 1));
    const pa = palmCenter(a.landmarks, aspect);
    const pb = palmCenter(b.landmarks, aspect);
    const size = (handSize(a.landmarks, aspect) + handSize(b.landmarks, aspect)) / 2;
    if (size <= 1e-4) return null;
    return {
      gap: Math.hypot(pa.x - pb.x, pa.y - pb.y) / size,
      side: Math.sign(pa.x - pb.x),
      upright: [a, b].every((h) => isUpright(h.landmarks, aspect, maxTiltDeg)),
    };
  }

  function createClapDetector(options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    let samples = []; // { t, gap, side, upright }
    let pending = null; // { t, side } touch waiting for confirmation
    let lastClapAt = -Infinity;
    let lastHandAt = -Infinity;

    const recent = (now, ms) => samples.filter((s) => now - s.t <= ms);
    const apartSample = (now) => recent(now, cfg.windowMs).find((s) => s.gap >= cfg.apartRatio);

    function fire(now) {
      pending = null;
      if (now - lastClapAt < cfg.cooldownMs) return false;
      lastClapAt = now;
      samples = [];
      return true;
    }

    function resolvePending(m, now) {
      if (!pending) return false;
      const crossed = m && m.side !== 0 && pending.side !== 0 && m.side !== pending.side;
      if (crossed) {
        pending = null;
        samples = [];
        return false;
      }
      return now - pending.t >= cfg.confirmMs ? fire(now) : false;
    }

    // Feed every tracking result. Returns true when a single clap just happened.
    function update(hands, now, aspect = 16 / 9) {
      if (hands.length) lastHandAt = now;
      const m = measure(hands, aspect, cfg.maxTiltDeg);
      if (resolvePending(m, now)) return true;
      if (m !== null) {
        samples = [...recent(now, cfg.windowMs), { t: now, ...m }];
        const apart = apartSample(now);
        const touching = m.gap <= cfg.touchRatio && m.upright;
        if (!pending && touching && apart) pending = { t: now, side: apart.side };
        return false;
      }
      const last = samples[samples.length - 1];
      const lostAtContact =
        last && last.upright && now - last.t <= cfg.lostGraceMs &&
        last.gap <= cfg.lostCloseRatio && apartSample(now);
      return !pending && lostAtContact ? fire(now) : false;
    }

    // Feed loud audio transients. Returns true when it counts as a single clap.
    function confirmAudio(now) {
      return now - lastHandAt <= cfg.audioHandsMs ? fire(now) : false;
    }

    return { update, confirmAudio };
  }

  // register(now) -> 'first' (wait for the second clap), 'double' (toggle now)
  // or 'ignored' (inside the lockout after a toggle).
  function createDoubleClap(options = {}) {
    const cfg = { ...DOUBLE_DEFAULTS, ...options };
    let first = null;
    let lockedUntil = -Infinity;

    function register(now) {
      if (now < lockedUntil) return 'ignored';
      const gap = first === null ? Infinity : now - first;
      if (gap >= cfg.minGapMs && gap <= cfg.maxGapMs) {
        first = null;
        lockedUntil = now + cfg.lockoutMs;
        return 'double';
      }
      if (gap < cfg.minGapMs) return 'ignored';
      first = now;
      return 'first';
    }

    return { register };
  }

  FX.createClapDetector = createClapDetector;
  FX.createDoubleClap = createDoubleClap;
  if (typeof module !== 'undefined') module.exports = { createClapDetector, createDoubleClap };
})();
