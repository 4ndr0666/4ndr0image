/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// This file is written in plain JavaScript to be compatible with web workers
// without a build step, preventing syntax errors in the browser.

// --- Start: Color Conversion Utilities ---
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [r * 255, g * 255, b * 255];
}
// --- End: Color Conversion Utilities ---

const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));

// A simple easing function for smooth tonal adjustments
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

self.onmessage = (event) => {
  try {
    const { imageData, params, requestId } = event.data;
    if (!imageData || !params || typeof requestId !== 'number') {
        throw new Error("Invalid message data received in worker.");
    }
    const { data } = imageData;

    const exposureFactor = Math.pow(2, params.exposure / 100.0);
    const brightness = params.brightness;
    const contrastFactor = 1.0 + (params.contrast / 100.0);
    const highlights = params.highlights / 100.0;
    const shadows = params.shadows / 100.0;
    const saturation = params.saturation / 100.0;
    const vibrance = params.vibrance / 100.0;


    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // --- 1. Tonal Adjustments (Linear) ---
      // Apply Exposure
      r *= exposureFactor;
      g *= exposureFactor;
      b *= exposureFactor;
      
      // Apply Brightness & Contrast
      r = (r - 128) * contrastFactor + 128 + brightness;
      g = (g - 128) * contrastFactor + 128 + brightness;
      b = (b - 128) * contrastFactor + 128 + brightness;
      
      r = clamp(r);
      g = clamp(g);
      b = clamp(b);

      // --- 2. Color and Advanced Tonal Adjustments (HSL) ---
      let [h, s, l] = rgbToHsl(r, g, b);
      
      // Apply Highlights & Shadows to Lightness (l)
      // We use an easing curve to make the effect stronger at the ends of the tonal range
      if (highlights !== 0) {
        l += easeInOutCubic(l) * highlights;
      }
      if (shadows !== 0) {
        l += easeInOutCubic(1 - l) * shadows;
      }
      l = clamp(l, 0, 1);

      // Apply Saturation & Vibrance to Saturation (s)
      if (vibrance !== 0) {
        // Vibrance has a stronger effect on less saturated colors
        s += vibrance * (1 - easeInOutCubic(s));
      }
      if (saturation !== 0) {
        s *= (1 + saturation);
      }
      s = clamp(s, 0, 1);
      
      // --- 3. Convert back to RGB ---
      [r, g, b] = hslToRgb(h, s, l);
      
      // Final clamp and assignment
      data[i] = clamp(r);
      data[i + 1] = clamp(g);
      data[i + 2] = clamp(b);
    }

    self.postMessage({ resultImageData: imageData, requestId });
  } catch(err) {
      console.error('Error in adjustmentWorker:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown worker error occurred.';
      self.postMessage({ error: errorMessage, requestId: event.data?.requestId ?? -1 });
  }
};