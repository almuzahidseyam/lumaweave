// Runs MediaPipe Hand Landmarker (always) and Image Segmenter (only when the
// page asks for a person mask) for the Meet page that embeds this frame.
import { FilesetResolver, HandLandmarker, ImageSegmenter } from '../vendor/vision_bundle.mjs';

const parentOrigin = location.ancestorOrigins?.[0] || '*';
const vendor = (path) => new URL(`../vendor/${path}`, location.href).href;
const MASK_WIDTH = 192; // person mask is sent back small; it is only used for soft lighting

function reply(message, transfer = []) {
  window.parent.postMessage(message, parentOrigin, transfer);
}

let filesetPromise = null;
const fileset = () => (filesetPromise ||= FilesetResolver.forVisionTasks(vendor('wasm')));

async function withDelegate(create) {
  try {
    return { task: await create('GPU'), delegate: 'GPU' };
  } catch (gpuError) {
    return { task: await create('CPU'), delegate: 'CPU' };
  }
}

const createLandmarker = async (delegate) => HandLandmarker.createFromOptions(await fileset(), {
  baseOptions: { modelAssetPath: vendor('hand_landmarker.task'), delegate },
  runningMode: 'VIDEO',
  numHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

const createSegmenter = async (delegate) => ImageSegmenter.createFromOptions(await fileset(), {
  baseOptions: { modelAssetPath: vendor('selfie_segmenter.tflite'), delegate },
  runningMode: 'VIDEO',
  outputCategoryMask: false,
  outputConfidenceMasks: true,
});

function toHands(result) {
  return result.landmarks.map((points, i) => ({
    handedness: result.handednesses?.[i]?.[0]?.categoryName || `Hand${i}`,
    landmarks: points.map((p) => [p.x, p.y, p.z]),
  }));
}

// Downsample the float confidence mask into a small RGBA buffer (white, with
// alpha = confidence) that the page can draw directly.
function toMask(result, srcW, srcH) {
  const confidence = result.confidenceMasks?.[0];
  if (!confidence) return null;
  const values = confidence.getAsFloat32Array();
  const width = Math.min(MASK_WIDTH, srcW);
  const height = Math.max(1, Math.round((srcH * width) / srcW));
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / width));
      const o = (y * width + x) * 4;
      rgba[o] = 255;
      rgba[o + 1] = 255;
      rgba[o + 2] = 255;
      rgba[o + 3] = Math.round(values[sy * srcW + sx] * 255);
    }
  }
  return { width, height, data: rgba.buffer };
}

let landmarker = null;
let segmenter = null;
let segmenterLoading = null;
let lastTimestamp = 0;

function ensureSegmenter() {
  if (segmenter || segmenterLoading) return;
  segmenterLoading = withDelegate(createSegmenter)
    .then((created) => { segmenter = created.task; })
    .catch((error) => reply({ type: 'plexus:segment-error', message: String(error?.message || error) }));
}

function segment(bitmap, ts) {
  if (!segmenter) {
    ensureSegmenter();
    return null;
  }
  const result = segmenter.segmentForVideo(bitmap, ts);
  try {
    return toMask(result, bitmap.width, bitmap.height);
  } finally {
    result.close?.();
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  const msg = event.data || {};
  if (msg.type !== 'plexus:frame' || !msg.bitmap) return;
  const { bitmap } = msg;
  try {
    if (!landmarker) {
      reply({ type: 'plexus:hands', hands: [] });
      return;
    }
    lastTimestamp = Math.max(lastTimestamp + 1, Math.round(performance.now()));
    const hands = toHands(landmarker.detectForVideo(bitmap, lastTimestamp));
    const mask = msg.segment ? segment(bitmap, lastTimestamp) : null;
    reply({ type: 'plexus:hands', hands, mask }, mask ? [mask.data] : []);
  } catch (error) {
    reply({ type: 'plexus:hands', hands: [] });
  } finally {
    bitmap.close();
  }
});

withDelegate(createLandmarker)
  .then((created) => {
    landmarker = created.task;
    reply({ type: 'plexus:ready', delegate: created.delegate });
  })
  .catch((error) => reply({ type: 'plexus:error', message: String(error?.message || error) }));
