// Utility functions for converting between Hex, RGB, and HSL color spaces

export interface RGBA {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export interface HSLA {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
  a: number; // 0-1
}

export const hexToRgb = (hex: string): RGBA => {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  if (c.length === 6) {
    c += 'ff';
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) {
    return { r: 59, g: 130, b: 246, a: 1 }; // Default blue
  }
  return {
    r: (num >> 24) & 255,
    g: (num >> 16) & 255,
    b: (num >> 8) & 255,
    a: Math.round(((num & 255) / 255) * 100) / 100,
  };
};

export const rgbToHex = (r: number, g: number, b: number, a: number = 1): string => {
  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
  const cr = Math.round(clamp(r, 0, 255));
  const cg = Math.round(clamp(g, 0, 255));
  const cb = Math.round(clamp(b, 0, 255));
  const ca = Math.round(clamp(a, 0, 1) * 255);

  const hexR = cr.toString(16).padStart(2, '0');
  const hexG = cg.toString(16).padStart(2, '0');
  const hexB = cb.toString(16).padStart(2, '0');
  const hexA = ca.toString(16).padStart(2, '0');

  return ca < 255 ? `#${hexR}${hexG}${hexB}${hexA}` : `#${hexR}${hexG}${hexB}`;
};

export const rgbToHsl = (r: number, g: number, b: number, a: number = 1): HSLA => {
  const rNorm = Math.min(255, Math.max(0, r)) / 255;
  const gNorm = Math.min(255, Math.max(0, g)) / 255;
  const bNorm = Math.min(255, Math.max(0, b)) / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a,
  };
};

export const hslToRgb = (h: number, s: number, l: number, a: number = 1): RGBA => {
  const hNorm = ((h % 360) + 360) % 360 / 360;
  const sNorm = Math.min(100, Math.max(0, s)) / 100;
  const lNorm = Math.min(100, Math.max(0, l)) / 100;

  if (sNorm === 0) {
    const val = Math.round(lNorm * 255);
    return { r: val, g: val, b: val, a };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  const r = hue2rgb(p, q, hNorm + 1 / 3);
  const g = hue2rgb(p, q, hNorm);
  const b = hue2rgb(p, q, hNorm - 1 / 3);

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a,
  };
};

export const hslToHex = (h: number, s: number, l: number, a: number = 1): string => {
  const rgb = hslToRgb(h, s, l, a);
  return rgbToHex(rgb.r, rgb.g, rgb.b, rgb.a);
};

export const hexToHsl = (hex: string): HSLA => {
  const rgb = hexToRgb(hex);
  return rgbToHsl(rgb.r, rgb.g, rgb.b, rgb.a);
};

export const isValidHex = (hex: string): boolean => {
  return /^#?([0-9A-F]{3}|[0-9A-F]{6}|[0-9A-F]{8})$/i.test(hex);
};
