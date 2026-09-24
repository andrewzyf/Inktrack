import { CanvasTexture, RepeatWrapping, ClampToEdgeWrapping, LinearMipmapLinearFilter, LinearFilter } from 'three';
import { mulberry32 } from '../core/random.js';

/**
 * Procedural "hand-inked" textures drawn on 2D canvases at startup — no image
 * assets to download, and every theme gets its own look for free.
 */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** A slightly wobbly stroke, like a brush pen. */
export function inkStroke(ctx, x0, y0, x1, y1, width, rand, wobble = 0.8) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.round(len / 12));
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t + (i > 0 && i < steps ? (rand() - 0.5) * wobble * 2 : 0);
    const y = y0 + (y1 - y0) * t + (i > 0 && i < steps ? (rand() - 0.5) * wobble * 2 : 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** Draw fn at y and wrapped copies so the texture tiles vertically. */
function wrapY(h, y, fn) {
  fn(0);
  if (y < 40) fn(h);
  if (y > h - 40) fn(-h);
}

const ROAD_STYLES = {
  rooftop: { base: '#6b6784', dark: '#4f4b66', line: '#fdf6e3', center: '#ffd23f', hatch: '#2b2838', centerDash: true },
  ruins: { base: '#c9a36b', dark: '#a8814e', line: '#f4e4c1', center: null, hatch: '#5a3f22', slabs: true },
  frost: { base: '#e9f1fb', dark: '#c3d3ea', line: '#5f8fd6', center: null, hatch: '#6c86b3', tracks: true },
  ice: { base: '#bfe9ff', dark: '#8fd3f5', line: '#ffffff', center: null, hatch: '#4aa3d8', cracks: true },
  plain: { base: '#8c8aa0', dark: '#707088', line: '#ffffff', center: '#ffd23f', hatch: '#2b2838', centerDash: true },
  boost: { base: '#ff7a1a', dark: '#ff9a3c', line: '#fff2a8', center: null, hatch: '#8a2c00', chevrons: true },
};

/**
 * Road atlas: the left 86 % is the road surface (tiles along v), the right
 * strip is white so walls/trim sharing the mesh show pure vertex colour.
 */
export function roadTexture(styleName = 'rooftop', size = 256) {
  const st = ROAD_STYLES[styleName] || ROAD_STYLES.plain;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rand = mulberry32(styleName.length * 977 + 13);
  const W = Math.round(size * 0.86);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = st.base;
  ctx.fillRect(0, 0, W, size);

  // Mottled patches for texture.
  for (let i = 0; i < 26; i++) {
    const x = rand() * W, y = rand() * size, r = 6 + rand() * 18;
    ctx.fillStyle = st.dark;
    ctx.globalAlpha = 0.35;
    wrapY(size, y, (o) => {
      ctx.beginPath();
      ctx.ellipse(x, y + o, r, r * (0.5 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;

  if (st.slabs) {
    // Big stone slabs with ink joints.
    ctx.strokeStyle = st.hatch;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = (r * size) / rows;
      inkStroke(ctx, 0, y, W, y, 3, rand, 1.5);
      const off = r % 2 ? W / 4 : 0;
      for (let k = 0; k < 3; k++) {
        const x = off + (k * W) / 2;
        if (x > 2 && x < W - 2) inkStroke(ctx, x, y, x, y + size / rows, 2.5, rand, 1.2);
      }
    }
  }
  if (st.tracks) {
    // Tyre ruts pressed into snow.
    ctx.strokeStyle = st.dark;
    for (const x of [W * 0.3, W * 0.36, W * 0.64, W * 0.7]) {
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rand() - 0.5) * 3, size);
      ctx.stroke();
    }
  }
  if (st.chevrons) {
    // Big inked chevrons pointing along +v (direction of travel).
    for (const y0 of [size * 0.1, size * 0.6]) {
      ctx.beginPath();
      ctx.moveTo(W * 0.15, y0);
      ctx.lineTo(W * 0.5, y0 + size * 0.22);
      ctx.lineTo(W * 0.85, y0);
      ctx.lineTo(W * 0.85, y0 + size * 0.14);
      ctx.lineTo(W * 0.5, y0 + size * 0.36);
      ctx.lineTo(W * 0.15, y0 + size * 0.14);
      ctx.closePath();
      ctx.fillStyle = '#fff2a8';
      ctx.fill();
      ctx.strokeStyle = '#141018';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
  if (st.cracks) {
    ctx.strokeStyle = '#ffffff';
    for (let i = 0; i < 7; i++) {
      let x = rand() * W, y = rand() * size;
      for (let k = 0; k < 4; k++) {
        const nx = x + (rand() - 0.5) * 60, ny = y + (rand() - 0.5) * 60;
        inkStroke(ctx, x, y, Math.max(4, Math.min(W - 4, nx)), ny, 2, rand, 2);
        x = Math.max(4, Math.min(W - 4, nx));
        y = ny;
      }
    }
  }

  // Hatching strokes — the "inked" texture.
  ctx.strokeStyle = st.hatch;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 34; i++) {
    const x = 14 + rand() * (W - 28), y = rand() * size, l = 5 + rand() * 9;
    wrapY(size, y, (o) => inkStroke(ctx, x, y + o, x + l, y + o - l * 0.6, 1.6, rand, 0.3));
  }
  ctx.globalAlpha = 1;

  // Edge lines.
  ctx.strokeStyle = st.line;
  const edge = Math.round(W * 0.055);
  ctx.lineWidth = Math.max(3, size / 42);
  ctx.beginPath();
  ctx.moveTo(edge, 0); ctx.lineTo(edge, size);
  ctx.moveTo(W - edge, 0); ctx.lineTo(W - edge, size);
  ctx.stroke();
  // Ink edge at the very border so the road reads against its walls.
  ctx.strokeStyle = '#141018';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1.5, 0); ctx.lineTo(1.5, size);
  ctx.moveTo(W - 1.5, 0); ctx.lineTo(W - 1.5, size);
  ctx.stroke();

  if (st.center && st.centerDash) {
    ctx.fillStyle = st.center;
    ctx.strokeStyle = '#141018';
    ctx.lineWidth = 2;
    const w = Math.max(5, size / 36);
    for (const y of [size * 0.12, size * 0.62]) {
      ctx.beginPath();
      ctx.rect(W / 2 - w / 2, y, w, size * 0.26);
      ctx.fill();
      ctx.stroke();
    }
  }

  const tex = new CanvasTexture(c);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

/** Comic smoke puff: white blob, bold ink outline. RGBA with alpha. */
export function puffTexture(size = 128) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rand = mulberry32(7);
  const blobs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    blobs.push([size / 2 + Math.cos(a) * size * 0.16, size / 2 + Math.sin(a) * size * 0.16, size * (0.17 + rand() * 0.06)]);
  }
  blobs.push([size / 2, size / 2, size * 0.22]);
  ctx.fillStyle = '#141018';
  for (const [x, y, r] of blobs) {
    ctx.beginPath();
    ctx.arc(x, y, r + size * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of blobs) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A little shading crescent.
  ctx.fillStyle = '#d6d0ea';
  ctx.beginPath();
  ctx.arc(size * 0.58, size * 0.6, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  const tex = new CanvasTexture(c);
  return tex;
}

/** Contact shadow: solid ink core breaking up into halftone dots at the rim. */
export function blobShadowTexture(size = 128) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const half = size / 2;
  ctx.fillStyle = '#141018';
  ctx.beginPath();
  ctx.ellipse(half, half, half * 0.62, half * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  const cell = size / 16;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const cx = x + cell / 2 + ((y / cell) % 2 ? cell / 2 : 0), cy = y + cell / 2;
      const d = Math.hypot((cx - half) / 0.9, cy - half) / half;
      if (d > 1 || d < 0.55) continue;
      const r = cell * 0.62 * (1 - (d - 0.55) / 0.45);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return new CanvasTexture(c);
}

/** Tiny starburst spark for drift/boost particles. */
export function sparkTexture(size = 64) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const pts = 8;
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i / (pts * 2)) * Math.PI * 2;
    const r = i % 2 ? size * 0.18 : size * 0.46;
    ctx.lineTo(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#141018';
  ctx.lineWidth = size * 0.06;
  ctx.fill();
  ctx.stroke();
  return new CanvasTexture(c);
}

export const COMIC_FONT = "'Bangers', 'Impact', 'Arial Black', sans-serif";

const FACADE_STYLES = {
  // Windows on a white base (tinted per building by vertex colour).
  rooftop: { base: '#ffffff', window: '#2e2647', lit: ['#ffe38a', '#ffd23f', '#9ff3ff'], litChance: 0.3, frame: '#141018' },
  ruins: { base: '#ffffff', stone: true, frame: '#3d2c1a' },
  frost: { base: '#ffffff', strata: true, frame: '#3b4a70' },
};

/** Tiling facade: a 4×4 grid of windows (or stone blocks / rock strata). */
export function facadeTexture(style = 'rooftop', size = 256) {
  const st = FACADE_STYLES[style] || FACADE_STYLES.rooftop;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rand = mulberry32(style.length * 131 + 5);
  ctx.fillStyle = st.base;
  ctx.fillRect(0, 0, size, size);
  const cell = size / 4;
  if (st.stone) {
    ctx.strokeStyle = st.frame;
    for (let r = 0; r < 4; r++) {
      const y = r * cell;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#000000';
      for (let k = 0; k < 3; k++) ctx.fillRect(rand() * size, y + 4, 20 + rand() * 30, cell - 8);
      ctx.globalAlpha = 1;
      inkStroke(ctx, 0, y + 1, size, y + 1, 3, rand, 1.2);
      const off = r % 2 ? cell / 2 : 0;
      for (let k = 0; k <= 4; k++) inkStroke(ctx, off + k * cell, y, off + k * cell, y + cell, 2.5, rand, 1);
    }
    // Moss hints.
    ctx.fillStyle = 'rgba(80,140,60,0.35)';
    for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(rand() * size, rand() * size, 4 + rand() * 10, 0, Math.PI * 2); ctx.fill(); }
  } else if (st.strata) {
    ctx.strokeStyle = st.frame;
    for (let r = 0; r < 6; r++) {
      const y = (r + 0.5) * (size / 6);
      ctx.globalAlpha = 0.6;
      inkStroke(ctx, 0, y, size, y + (rand() - 0.5) * 10, 2.2, rand, 4);
    }
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#1a2340';
    for (let i = 0; i < 30; i++) ctx.fillRect(rand() * size, rand() * size, 2, 8 + rand() * 18);
    ctx.globalAlpha = 1;
  } else {
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        const x = gx * cell + 14, y = gy * cell + 12, w = cell - 28, h = cell - 24;
        const lit = rand() < st.litChance;
        ctx.fillStyle = lit ? pickColor(st.lit, rand) : st.window;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = st.frame;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        if (!lit) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x + 4, y + h - 5); ctx.lineTo(x + w - 5, y + 4); ctx.stroke();
        }
      }
    }
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function pickColor(list, rand) {
  return list[Math.floor(rand() * list.length) % list.length];
}

const SIGN_WORDS = {
  rooftop: [['INK!', '#ff3d7f'], ['POW', '#ffd23f'], ['ZAP', '#3df2ff'], ['EAT', '#ff8a3d'], ['HOTEL', '#b86bff'], ['24H', '#7cff6b'], ['BAM!', '#ff4d5a'], ['RAMEN', '#ffe066']],
  ruins: [['!', '#ffd23f'], ['?', '#7cff6b'], ['◆', '#ff8a3d'], ['▲', '#3df2ff'], ['☼', '#ffe066'], ['✦', '#ff3d7f'], ['●', '#b86bff'], ['■', '#ffffff']],
  frost: [['SKI', '#3df2ff'], ['HOT COCOA', '#ff8a3d'], ['BRRR!', '#ffffff'], ['LODGE', '#ffd23f'], ['ICE!', '#7fd4ff'], ['SNOW', '#ffffff'], ['PEAK', '#ff3d7f'], ['YETI?', '#b86bff']],
};

/** 4×2 atlas of hand-lettered neon signs (text with ink outline on a dark panel). */
export function signTexture(style = 'rooftop') {
  const W = 1024, H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const words = SIGN_WORDS[style] || SIGN_WORDS.rooftop;
  const cw = W / 4, ch = H / 2;
  words.forEach(([word, color], i) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
    ctx.fillStyle = '#211a33';
    ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.strokeRect(x + 12, y + 12, cw - 24, ch - 24);
    let size = 120;
    ctx.font = `${size}px ${COMIC_FONT}`;
    while (ctx.measureText(word).width > cw - 50 && size > 30) {
      size -= 6;
      ctx.font = `${size}px ${COMIC_FONT}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#141018';
    ctx.strokeText(word, x + cw / 2, y + ch / 2 + 6);
    ctx.fillStyle = color;
    ctx.fillText(word, x + cw / 2, y + ch / 2 + 6);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x + 26, y + 26, 30, 8);
  });
  const tex = new CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** Gate banners: rows START (top), CHECKPOINT, FINISH (bottom). */
export function bannerTexture() {
  const W = 512, H = 384;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rows = [
    ['START', '#ffffff', true],
    ['CHECKPOINT', '#ffd23f', false],
    ['FINISH', '#ffffff', true],
  ];
  rows.forEach(([text, color, checker], i) => {
    const y = i * (H / 3), h = H / 3;
    ctx.fillStyle = color;
    ctx.fillRect(0, y, W, h);
    if (checker) {
      const s = h / 4;
      ctx.fillStyle = '#141018';
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < W / s; xx++) if ((xx + yy) % 2 === 0) ctx.fillRect(xx * s, y + yy * s, s, s);
      ctx.fillStyle = color;
      ctx.fillRect(W * 0.16, y + h * 0.12, W * 0.68, h * 0.76);
    }
    ctx.font = `${Math.round(h * 0.62)}px ${COMIC_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#141018';
    ctx.strokeText(text, W / 2, y + h / 2 + 4);
    ctx.fillStyle = i === 1 ? '#ff4d5a' : '#ffd23f';
    ctx.fillText(text, W / 2, y + h / 2 + 4);
    ctx.fillStyle = '#141018';
    ctx.fillRect(0, y, W, 6);
    ctx.fillRect(0, y + h - 6, W, 6);
  });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(W - 12, 0, 12, 12); // plain texel for the banner sides (uv 0.99)
  return new CanvasTexture(c);
}
