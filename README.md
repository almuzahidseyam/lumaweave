# Meet Plexus

Double-clap on camera in Google Meet and glowing plexus strings, translucent facets, shattering
triangle shards and dissolving particles appear between your fingertips, while your footage dims
slightly and picks up the glow. Double-clap again and the web crumbles into dust. Everyone in the
call sees it, because the effect is drawn into the camera feed itself.

## Install (Chrome, unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `meet-plexus` folder (after updates, click the reload icon).
3. Reload the Meet tab and turn your camera on.

## Use

- **Double-clap** (two claps within about a second) with your hands in view to turn it on; double-clap
  again to turn it off. After the first clap the status pill says "clap again".
- **Alt+Shift+P**, or the **Turn on / Turn off** button in the toolbar popup, also toggles.
- Claps are recognised by the camera (palms meeting) and by sound (a sharp clap through the mic while a
  hand is in view). The sound is analysed on your computer only; turn it off in the popup if you prefer.

## Settings (toolbar icon)

- **Color presets**: Violet, Ice, Ember, Neon, Mono.
- **Elements**: lines, line glow, triangles, fingertip dots, shards, dissolving particles, each with
  an on/off switch and its own color.
- **Footage**: how much to darken while the effect is on (default 25%), light spill onto the footage,
  and **person-aware lighting**, which cuts you out from the background so the glow lights you with a rim
  light and the background dims more than you. Person lighting runs a second AI model, so it costs more
  CPU/GPU.
- Changes apply live to the Meet video and sync across your Chrome profile.

## Troubleshooting

A "Meet Plexus · …" pill in the bottom-left of Meet shows how far it got:

| Pill says | Meaning |
|---|---|
| *(no pill at all)* | The extension isn't running on this tab. Reload it in `chrome://extensions`, then reload Meet. |
| loaded · waiting for your camera | Scripts are in, but Meet hasn't opened the camera yet. Turn it on, or reload the tab. |
| camera captured · loading hand tracking… | MediaPipe is starting (a few seconds). |
| hand tracking ready · double-clap or Alt+Shift+P | Everything works. |
| clap (camera / sound) · clap again… | One clap was recognised; a second one within a second toggles. |
| hand tracking failed: … | The tracker frame couldn't start; the message says why. |
| person lighting unavailable: … | The segmentation model couldn't start; the rest still works. |

## How it works

- `src/hook.js` wraps `getUserMedia` on Meet, returns a processed camera track and remembers the mic
  for clap sounds.
- `src/pipeline.js` processes each frame with insertable streams, so it keeps running in background tabs.
  Frames pass through untouched while the effect is off and idle.
- `detector/` is a hidden extension iframe running MediaPipe Hand Landmarker, plus Image Segmenter when
  person lighting is on (models bundled in `vendor/`, no network calls).
- `src/clap.js`: single claps from the camera and the mic, plus the double-clap gate.
- `src/plexus.js` draws the web, `src/particles.js` the shards and dust, `src/lighting.js` the darkening,
  light spill and person lighting.
- `src/settings.js` is the settings model shared by the popup (`popup/`), the bridge (`src/bridge.js`)
  and the page scripts; every value is validated wherever it crosses a boundary.

## Tests

```bash
node --test test/
```

`test/harness.html` runs the same pipeline outside Meet on a video (`?src=<url>`) or your webcam
(`?cam=1`); add `?person=1` for person lighting. Serve this folder as the site root.
