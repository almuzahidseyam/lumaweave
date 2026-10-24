// Runs MediaPipe Hand Landmarker (always) and Image Segmenter (only when the
// page asks for a person mask) for the Meet page that embeds this frame.
import { FilesetResolver, HandLandmarker, ImageSegmenter } from '../vendor/vision_bundle.mjs';
import { downsampleMask } from './mask.mjs';

const parameters = new URLSearchParams(location.hash.slice(1));
const parentOrigin = parameters.get('parent');
const channel = parameters.get('channel');
const ownOrigin = `${location.protocol}//${location.host}`;
const allowed = parentOrigin === 'https://meet.google.com' || parentOrigin === ownOrigin;
if (!allowed || !channel || window.parent === window) throw new Error('Untrusted detector parent');
const vendor = (path) => new URL(`../vendor/${path}`, location.href).href;
const MASK_WIDTH = 192; // person mask is sent back small; it is only used for soft lighting

function reply(message, transfer = []) {
  window.parent.postMessage({ ...message, channel }, parentOrigin, transfer);
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
function toMask(result) {
  const confidence = result.confidenceMasks?.[0];
  if (!confidence) return null;
  return downsampleMask(confidence.getAsFloat32Array(), confidence.width, confidence.height, MASK_WIDTH);
}

let landmarker = null;
let segmenter = null;
let segmenterLoading = null;
let lastTimestamp = 0;

function ensureSegmenter() {
  if (segmenter || segmenterLoading) return;
  segmenterLoading = withDelegate(createSegmenter)
    .then((created) => { segmenter = created.task; })
    .catch((error) => reply({ type: 'lumaweave:segment-error', message: String(error?.message || error) }));
}

function segment(bitmap, ts) {
  if (!segmenter) {
    ensureSegmenter();
    return null;
  }
  const result = segmenter.segmentForVideo(bitmap, ts);
  try {
    return toMask(result);
  } finally {
    result.close?.();
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.origin !== parentOrigin) return;
  const msg = event.data || {};
  if (msg.channel !== channel || msg.type !== 'lumaweave:frame' || !(msg.bitmap instanceof ImageBitmap)) return;
  const { bitmap } = msg;
  try {
    if (!landmarker) {
      reply({ type: 'lumaweave:hands', hands: [], requestId: msg.requestId });
      return;
    }
    lastTimestamp = Math.max(lastTimestamp + 1, Math.round(performance.now()));
    const hands = toHands(landmarker.detectForVideo(bitmap, lastTimestamp));
    const mask = msg.segment ? segment(bitmap, lastTimestamp) : null;
    reply({ type: 'lumaweave:hands', hands, mask, requestId: msg.requestId }, mask ? [mask.data] : []);
  } catch (error) {
    reply({ type: 'lumaweave:hands', hands: [], requestId: msg.requestId });
  } finally {
    bitmap.close();
  }
});

withDelegate(createLandmarker)
  .then((created) => {
    landmarker = created.task;
    reply({ type: 'lumaweave:ready', delegate: created.delegate });
  })
  .catch((error) => reply({ type: 'lumaweave:error', message: String(error?.message || error) }));
