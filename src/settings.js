// Settings model shared by the popup, the isolated-world bridge and the page
// scripts. Everything that crosses a boundary goes through sanitize() so a bad
// or stale stored value can never break rendering.
(() => {
  const ELEMENTS = ['lines', 'glow', 'triangles', 'nodes', 'shards', 'dust'];

  const DEFAULTS = Object.freeze({
    elements: {
      lines: { on: true, color: '#ffffff' },
      glow: { on: true, color: '#a878ff' },
      triangles: { on: true, color: '#a878ff' },
      nodes: { on: true, color: '#ffffff' },
      shards: { on: true, color: '#ffffff' },
      dust: { on: true, color: '#d6c4ff' },
    },
    darken: 25, // % darker footage while the effect is on
    lightSpill: { on: true, strength: 60 },
    personLight: { on: false, strength: 70 },
    clapSound: false,
    clapGesture: true,
    performance: 'balanced',
    reducedMotion: false,
  });

  const PRESETS = {
    Violet: { lines: '#ffffff', glow: '#a878ff', triangles: '#a878ff', nodes: '#ffffff', shards: '#ffffff', dust: '#d6c4ff' },
    Ice: { lines: '#e8fbff', glow: '#3cc8ff', triangles: '#3c9dff', nodes: '#ffffff', shards: '#dff6ff', dust: '#9fe6ff' },
    Ember: { lines: '#fff1dc', glow: '#ff8a2a', triangles: '#ff6a1f', nodes: '#fff4e0', shards: '#ffd29a', dust: '#ffb15c' },
    Neon: { lines: '#ffffff', glow: '#ff2fd6', triangles: '#29f0ff', nodes: '#fff36b', shards: '#ff9cf0', dust: '#7dfcff' },
    Mono: { lines: '#ffffff', glow: '#ffffff', triangles: '#cfd6e6', nodes: '#ffffff', shards: '#ffffff', dust: '#e8ecf5' },
  };

  const LABELS = {
    lines: 'Lines',
    glow: 'Line glow',
    triangles: 'Triangles',
    nodes: 'Fingertip dots',
    shards: 'Shards',
    dust: 'Dissolving particles',
  };

  const HEX = /^#[0-9a-f]{6}$/i;
  const PROFILES = Object.freeze({
    battery: { interval: 100, width: 320 },
    balanced: { interval: 50, width: 480 },
    quality: { interval: 33, width: 640 },
  });

  const clamp = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
  const color = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);

  function sanitize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const els = src.elements && typeof src.elements === 'object' ? src.elements : {};
    const elements = Object.fromEntries(
      ELEMENTS.map((key) => {
        const d = DEFAULTS.elements[key];
        const e = els[key] && typeof els[key] === 'object' ? els[key] : {};
        return [key, { on: bool(e.on, d.on), color: color(e.color, d.color) }];
      }),
    );
    const spill = src.lightSpill || {};
    const person = src.personLight || {};
    return {
      elements,
      darken: clamp(src.darken, 0, 60, DEFAULTS.darken),
      lightSpill: {
        on: bool(spill.on, DEFAULTS.lightSpill.on),
        strength: clamp(spill.strength, 0, 100, DEFAULTS.lightSpill.strength),
      },
      personLight: {
        on: bool(person.on, DEFAULTS.personLight.on),
        strength: clamp(person.strength, 0, 100, DEFAULTS.personLight.strength),
      },
      clapSound: bool(src.clapSound, DEFAULTS.clapSound),
      clapGesture: bool(src.clapGesture, DEFAULTS.clapGesture),
      performance: ['battery', 'balanced', 'quality'].includes(src.performance) ? src.performance : DEFAULTS.performance,
      reducedMotion: bool(src.reducedMotion, DEFAULTS.reducedMotion),
    };
  }

  function applyPreset(settings, name) {
    const preset = Object.hasOwn(PRESETS, name) ? PRESETS[name] : null;
    if (!preset) return settings;
    const elements = Object.fromEntries(
      ELEMENTS.map((key) => [key, { ...settings.elements[key], color: preset[key] }]),
    );
    return { ...settings, elements };
  }

  // '#a878ff' -> '168, 120, 255' for rgba() strings.
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  const api = { ELEMENTS, DEFAULTS, PRESETS, LABELS, PROFILES, sanitize, applyPreset, rgb };
  globalThis.__lumaweaveSettings = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
