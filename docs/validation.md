# Validation — October 24, 2026

The imported Meet Plexus 1.1.1 baseline passed 20 Node unit tests. LumaWeave's expanded suite covers the fixes and new behavior with 32 unit tests and 8 browser scenarios.

The Windows local run uses Playwright Chromium headless shell for the preview/popup and the installed Microsoft Edge browser in a separate disposable profile for the MV3 installation fixture. Playwright's downloaded full Chrome-for-Testing executable had an invalid Windows side-by-side activation dependency on this PC; no Windows security settings or existing browser profiles were changed to work around it. The equivalent installation test uses Playwright Chromium in Linux CI.

## Automated coverage

- Double-clap windows/cooldown, gesture/audio deduplication, and sound with camera gestures disabled.
- Settings validation, safe preset lookup, local-first migration, immediate save submission and visible storage failures.
- Microphone mute/ended handling and cleanup after failed AudioContext setup.
- Model-mask dimensions/confidence sampling, extension-origin construction, wrong-channel/origin rejection, stale replies and bitmap teardown races.
- Camera-free preview without requesting devices, mobile layout, palette controls and keyboard activation.
- Camera-permission denial with usable simulated fallback.
- The actual bundled hand-landmark and person-segmentation models running against a synthetic camera, with processed video frames and cleanup after Stop camera.
- Output clones continuing after another consumer stops; final consumer teardown removes the tracker.
- Popup settings, JSON import/export, disabled camera-off control and save-error feedback.
- A real installed MV3 extension intercepting `getUserMedia` on a controlled `https://meet.google.com/` fixture with Trusted Types enforced, communicating with its extension-origin detector, receiving local preference changes and responding to the keyboard shortcut.
- A loopback-only development server rejecting repository internals, manifest/path validation, minimal declared permissions and vendor file SHA-256 verification.
- ZIP packaging and checksum verification.

The Meet-origin fixture is local test content. It does not join a call or use a Google account. A real two-person Google Meet session, actual hand accuracy, acoustic clap reliability, camera switching and hardware-specific performance remain manual acceptance checks. Synthetic-camera success must not be described as those checks having passed.
