# Source and bundled components

LumaWeave 2.0 is based on the user-supplied **Meet Plexus 1.1.1** archive, imported in the first commit so the original source remains identifiable. That archive supplied no separate license or author notice for the application code; this repository does not invent an upstream author attribution or relicense that source. New LumaWeave changes include lifecycle fixes, tracker isolation, local settings, the preview, UI, tests and release tooling. Public availability alone does not grant a software license.

## MediaPipe Tasks Vision 0.10.14

The bundled `vision_bundle.mjs` and four `wasm/vision_wasm*` files are byte-for-byte matches of `@mediapipe/tasks-vision@0.10.14` from its official npm distribution. These files remain unmodified. Copyright belongs to Google and the respective upstream contributors. The package declares Apache-2.0; the corresponding upstream license is included as `vendor/LICENSE.mediapipe.txt`.

- Package: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.14
- Source/license: https://github.com/google-ai-edge/mediapipe/tree/v0.10.14
- Runtime archive: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.14.tgz

## Bundled models

The two files were inherited from the archive and verified against Google's published model artifacts on October 24, 2026:

- Hand Landmarker: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- Selfie Segmenter: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

Model weights remain the work of their respective upstream owners. Source URLs and exact SHA-256 hashes are recorded in `vendor/manifest.json`; consult the upstream model documentation and terms for redistribution/use. Updating a `latest` URL does not update this extension: bundled files are pinned by their hashes.

Playwright is a development dependency only and is not bundled in the installable extension. Google Meet and Chrome are trademarks of Google; this project is independent and is not endorsed by Google.
