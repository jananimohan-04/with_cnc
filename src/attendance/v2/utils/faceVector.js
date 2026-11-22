// Face vectors are worked out here in the browser (no photos leave the device).
// The camera frame already drawn on a canvas is turned into a 128-number face vector with the same
// engine the rest of AI Attendance uses, after a quick light / sharpness check.
import { extract128VectorFromCanvas, computeConsensusVector } from '../../engine/faceMeshEngine';
import { evaluateLivenessQuality } from '../../engine/livenessDetector';

/**
 * Reads the face vector from a canvas that holds the current camera frame.
 * Returns { vector, quality, error } — error is a short message when the frame is not usable.
 */
export function faceVectorFromCanvas(canvas, { minSharpness = 0 } = {}) {
  if (!canvas) return { vector: null, quality: null, error: 'Camera frame not available. Ensure camera is running.' };
  const extraction = extract128VectorFromCanvas(canvas);
  const q = extraction.quality;
  if (!q.faceDetected) {
    return { vector: null, quality: q, error: 'No face clearly detected. Please position your face inside the guide frame.' };
  }
  const live = evaluateLivenessQuality(q.sharpness, q.brightness);
  if (!live.passed) {
    return { vector: null, quality: q, error: live.reason || 'Frame quality low. Please hold steady in good lighting.' };
  }
  if (minSharpness && q.sharpness < minSharpness) {
    return { vector: null, quality: q, error: 'Frame is slightly blurry. Hold still and face the light.' };
  }
  return { vector: extraction.vector, quality: q, error: null };
}

/** Same as faceVectorFromCanvas, for a captured JPEG/PNG data URL (e.g. stored enrollment samples). */
export function faceVectorFromDataUrl(dataUrl, opts) {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve({ vector: null, quality: null, error: 'No image captured.' });
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 480;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve({ vector: null, quality: null, error: 'Unable to read the captured image.' });
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(faceVectorFromCanvas(canvas, opts));
    };
    img.onerror = () => resolve({ vector: null, quality: null, error: 'Unable to read the captured image.' });
    img.src = dataUrl;
  });
}

export { computeConsensusVector };
