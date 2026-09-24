import {
  Group, Mesh, SphereGeometry, CylinderGeometry, ShaderMaterial, MeshBasicMaterial, CanvasTexture,
  BackSide, DoubleSide, Color, Vector3, RepeatWrapping,
} from 'three';
import { mulberry32 } from '../core/random.js';
import { inkStroke } from './textures.js';

/**
 * "Poster" background: a flat gradient sky dome with a halftone-shaded sun,
 * plus concentric cylinders carrying hand-inked silhouette panoramas (city
 * skyline, jungle canopy, mountain range, clouds). All drawn once to canvases
 * at load — the whole background is ~4 cheap draw calls with no lighting.
 */

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // pin to the far plane
  }
`;
const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunSize;
  uniform float uDotSize;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(uHorizon, uTop, smoothstep(0.0, 0.55, h)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, h));
    // Halftone band just above the horizon — printed-gradient look.
    vec2 p = gl_FragCoord.xy / uDotSize;
    p = vec2(p.x + p.y, p.y - p.x) * 0.70710678;
    float band = 1.0 - smoothstep(0.02, 0.32, abs(h - 0.1));
    float r = band * 0.42;
    float dotMask = 1.0 - smoothstep(r - 0.08, r + 0.08, length(fract(p) - 0.5));
    col = mix(col, mix(uHorizon, uTop, 0.5) * 1.08, dotMask * step(0.01, band) * 0.6);
    // Sun: flat disc, ink ring, halftone glow.
    float s = dot(d, normalize(uSunDir));
    float edge = cos(uSunSize);
    float ring = cos(uSunSize * 1.07);
    float glow = smoothstep(cos(uSunSize * 3.2), ring, s);
    float gDot = 1.0 - smoothstep(glow * 0.5 - 0.08, glow * 0.5 + 0.08, length(fract(p) - 0.5));
    col = mix(col, uSunColor, gDot * step(0.02, glow) * 0.7);
    col = mix(col, vec3(0.08, 0.06, 0.1), step(ring, s));
    col = mix(col, uSunColor, step(edge, s));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const INK = '#141018';

/** Fill + ink outline for a path built by `build(ctx)`. */
function inked(ctx, fill, lineWidth, build) {
  ctx.beginPath();
  build(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function halftoneRect(ctx, x, y, w, h, color, cell, fromTop = true) {
  ctx.fillStyle = color;
  for (let yy = 0; yy < h; yy += cell) {
    const t = fromTop ? yy / h : 1 - yy / h;
    const r = cell * 0.5 * Math.sqrt(t);
    if (r < 0.4) continue;
    for (let xx = ((yy / cell) % 2) * (cell / 2); xx < w; xx += cell) {
      ctx.beginPath();
      ctx.arc(x + xx, y + yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const painters = {
  city(ctx, W, H, o, rand) {
    let x = -20;
    while (x < W + 20) {
      const bw = 40 + rand() * 90;
      const bh = H * (0.22 + rand() * (o.tall ?? 0.55));
      const y = H - bh;
      inked(ctx, o.color, 4, (c) => {
        c.moveTo(x, H + 5);
        c.lineTo(x, y);
        if (rand() < 0.3) { c.lineTo(x + bw * 0.3, y); c.lineTo(x + bw * 0.5, y - 18); c.lineTo(x + bw * 0.7, y); }
        c.lineTo(x + bw, y);
        c.lineTo(x + bw, H + 5);
      });
      if (rand() < 0.3) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + bw * 0.5, y - (rand() < 0.5 ? 0 : 18)); ctx.lineTo(x + bw * 0.5, y - 45); ctx.stroke(); }
      // Windows
      if (o.windows) {
        for (let wy = y + 12; wy < H - 14; wy += 18) {
          for (let wx = x + 8; wx < x + bw - 12; wx += 16) {
            if (rand() < 0.42) { ctx.fillStyle = rand() < 0.8 ? o.windows : '#ffffff'; ctx.fillRect(wx, wy, 7, 9); }
          }
        }
      }
      halftoneRect(ctx, x + 4, y + bh * 0.4, bw - 8, bh * 0.6, o.shade || 'rgba(20,16,24,0.35)', 9);
      x += bw + (rand() < 0.3 ? rand() * 30 : 0);
    }
  },
  mountains(ctx, W, H, o, rand) {
    const peaks = o.peaks ?? 7;
    const seg = W / peaks;
    const pts = [[-10, H]];
    for (let i = 0; i <= peaks; i++) {
      const px = i * seg + (rand() - 0.5) * seg * 0.3;
      const py = H * (1 - (o.minH ?? 0.35) - rand() * (o.varH ?? 0.45));
      pts.push([px - seg * 0.35, H * (0.75 - rand() * 0.2)]);
      pts.push([px, py]);
    }
    pts.push([W + 10, H * 0.6], [W + 10, H]);
    inked(ctx, o.color, 5, (c) => pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))));
    if (o.snow) {
      for (let i = 2; i < pts.length - 2; i += 2) {
        const [px, py] = pts[i];
        const [lx, ly] = pts[i - 1];
        const d = (H - py) * 0.28;
        inked(ctx, o.snow, 3.5, (c) => {
          c.moveTo(px, py);
          c.lineTo(px + d * 0.55, py + d);
          c.lineTo(px + d * 0.2, py + d * 0.8);
          c.lineTo(px - d * 0.1, py + d * 1.05);
          c.lineTo(px - d * 0.35, py + d * 0.75);
          c.lineTo(px + (lx - px) * 0.25, py + (ly - py) * 0.25);
          c.closePath();
        });
      }
    }
    halftoneRect(ctx, 0, H * 0.7, W, H * 0.3, 'rgba(20,16,24,0.25)', 10);
  },
  jungle(ctx, W, H, o, rand) {
    // Temple silhouette(s) then a canopy of bumps in front.
    if (o.temples) {
      for (let k = 0; k < o.temples; k++) {
        const cx = W * (0.15 + 0.7 * rand()), base = H * 0.95, tiers = 5, tw = 160 + rand() * 80;
        for (let t = 0; t < tiers; t++) {
          const w = tw * (1 - t * 0.17), hh = 26;
          inked(ctx, o.temple, 4, (c) => c.rect(cx - w / 2, base - (t + 1) * hh, w, hh));
        }
        inked(ctx, o.temple, 4, (c) => c.rect(cx - 18, base - tiers * 26 - 30, 36, 30));
      }
    }
    for (let row = 0; row < 2; row++) {
      let x = -30;
      const baseY = H * (row === 0 ? 0.62 : 0.8);
      while (x < W + 30) {
        const r = 28 + rand() * 40;
        inked(ctx, row === 0 ? o.back : o.color, 4, (c) => {
          c.moveTo(x - r, H + 5);
          c.lineTo(x - r, baseY);
          c.arc(x, baseY, r, Math.PI, 0);
          c.lineTo(x + r, H + 5);
        });
        x += r * 1.3;
      }
    }
    halftoneRect(ctx, 0, H * 0.78, W, H * 0.22, 'rgba(20,16,24,0.3)', 9);
  },
  clouds(ctx, W, H, o, rand) {
    const n = o.count ?? 7;
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.2 + rand() * 0.6) * (W / n), cy = H * (0.3 + rand() * 0.4), s = 30 + rand() * 30;
      const blobs = [];
      for (let k = 0; k < 5; k++) blobs.push([cx + (k - 2) * s * 0.8, cy + (k % 2 ? -s * 0.35 : 0) + rand() * 6, s * (0.7 + rand() * 0.5)]);
      ctx.fillStyle = INK;
      for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = o.color;
      for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = o.shade || 'rgba(120,110,170,0.35)';
      ctx.fillRect(cx - s * 2.2, cy + s * 0.25, s * 4.4, 4);
    }
  },
  hills(ctx, W, H, o, rand) {
    inked(ctx, o.color, 4, (c) => {
      c.moveTo(-10, H);
      for (let x = -10; x <= W + 10; x += 20) c.lineTo(x, H * (0.55 + 0.12 * Math.sin(x / 90 + rand() * 0.2) + 0.06 * Math.sin(x / 31)));
      c.lineTo(W + 10, H);
    });
  },
};

/**
 * theme.sky: { top, horizon, bottom, sun: { color, azimuth, elevation, size },
 *              layers: [{ type, radius, height, y, repeat, color, …painter opts }] }
 */
export class Sky {
  constructor() {
    this.group = new Group();
    this.group.name = 'sky';
    this.dome = new Mesh(
      new SphereGeometry(900, 24, 12),
      new ShaderMaterial({
        uniforms: {
          uTop: { value: new Color() }, uHorizon: { value: new Color() }, uBottom: { value: new Color() },
          uSunColor: { value: new Color() }, uSunDir: { value: new Vector3(0, 1, 0) }, uSunSize: { value: 0.08 },
          uDotSize: { value: 8 },
        },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    this.layers = [];
  }

  setTheme(sky, seed = 1) {
    const u = this.dome.material.uniforms;
    u.uTop.value.set(sky.top);
    u.uHorizon.value.set(sky.horizon);
    u.uBottom.value.set(sky.bottom ?? sky.horizon);
    u.uSunColor.value.set(sky.sun?.color ?? 0xfff2a8);
    const az = sky.sun?.azimuth ?? 0.6, el = sky.sun?.elevation ?? 0.25;
    u.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    u.uSunSize.value = sky.sun?.size ?? 0.07;

    for (const l of this.layers) {
      this.group.remove(l);
      l.geometry.dispose();
      l.material.map?.dispose();
      l.material.dispose();
    }
    this.layers = [];
    (sky.layers || []).forEach((layer, i) => this.layers.push(this._makeLayer(layer, seed * 31 + i * 7, -90 + i)));
  }

  _makeLayer(opts, seed, order) {
    const W = 2048, H = opts.pixelHeight ?? 384;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const rand = mulberry32(seed);
    painters[opts.type](ctx, W, H, opts, rand);
    const tex = new CanvasTexture(c);
    tex.wrapS = RepeatWrapping;
    tex.repeat.set(opts.repeat ?? 2, 1);
    tex.anisotropy = 4;
    const radius = opts.radius ?? 700;
    const height = opts.height ?? 160;
    const geo = new CylinderGeometry(radius, radius, height, 64, 1, true);
    const mat = new MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5, side: BackSide, depthWrite: false, fog: false });
    const mesh = new Mesh(geo, mat);
    mesh.position.y = (opts.y ?? 0) + height / 2;
    mesh.rotation.y = opts.rotation ?? seed * 0.37;
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.userData.drift = opts.drift ?? 0;
    this.group.add(mesh);
    return mesh;
  }

  /** Follow the camera horizontally so the poster always sits at the horizon. */
  update(dt, camera, pixelRatio = 1) {
    this.group.position.x = camera.position.x;
    this.group.position.z = camera.position.z;
    this.group.position.y = camera.position.y * 0.85;
    this.dome.material.uniforms.uDotSize.value = 7 * pixelRatio;
    for (const l of this.layers) if (l.userData.drift) l.rotation.y += l.userData.drift * dt;
  }
}

export { DoubleSide, inkStroke };
