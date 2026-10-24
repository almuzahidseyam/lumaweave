# Changelog

## 2.0.1 — October 24, 2026

- Added the MIT License for the application code and documentation, copyright 2026 Muhammad Al-Muzahid.
- Included the license in the installable ZIP and added package author/license metadata.
- Preserved bundled third-party licenses and clarified application/source notices. No camera or rendering behavior changed.

## 2.0.0 — October 24, 2026

- Renamed Meet Plexus to LumaWeave throughout the extension, messages, UI and documentation; introduced a woven-light icon.
- Added a camera-free simulated preview and explicit opt-in camera preview with bundled hand/person models.
- Added Battery saver, Balanced and High quality tracking profiles, gentler motion, and an independent camera-clap switch.
- Made sound clap opt-in, respected Meet's mic mute/ended state, and cleaned up audio on failed setup and shutdown.
- Replaced delayed sync writes with immediate local preference writes, error feedback, legacy preference migration and JSON import/export.
- Released the camera pipeline/tracker after the final consumer stops, retained working cloned output tracks, and closed bitmaps created during teardown.
- Fixed extension-scheme origin handling, added detector parent/channel/request checks and validated landmark/mask messages.
- Corrected segmentation sampling to use the output mask's own dimensions; added stale-response protection and tracking timeouts.
- Added automated browser tests, regression tests, vendor checksums, packaging and GitHub validation.

## 1.1.1 — imported baseline

Original user-provided Meet Plexus archive, preserved as the first repository commit. No original development date is asserted.
