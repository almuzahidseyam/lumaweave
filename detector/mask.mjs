// The model's output mask dimensions can differ from the camera frame.
export function downsampleMask(confidence, sourceWidth, sourceHeight, maxWidth = 192) {
  if (!(sourceWidth > 0 && sourceHeight > 0) || confidence.length !== sourceWidth * sourceHeight) return null;
  const width = Math.min(maxWidth, sourceWidth);
  const height = Math.max(1, Math.round(sourceHeight * width / sourceWidth));
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(sourceHeight - 1, Math.floor((y + 0.5) * sourceHeight / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(sourceWidth - 1, Math.floor((x + 0.5) * sourceWidth / width));
      const offset = (y * width + x) * 4;
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = 255;
      const value = confidence[sy * sourceWidth + sx];
      rgba[offset + 3] = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 255) : 0;
    }
  }
  return { width, height, data: rgba.buffer };
}
