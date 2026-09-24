import {
  InstancedBufferGeometry, InstancedBufferAttribute, PlaneGeometry, Mesh, ShaderMaterial,
  CanvasTexture, Color, Vector3,
} from 'three';
import { shared } from './materials.js';

/**
 * Pooled camera-facing sprites (comic smoke puffs + starburst sparks) in a
 * single instanced draw call.
 */

const vertex = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iParams; // size, rotation, alpha, frame
  attribute vec3 iColor;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vFogDepth;
  void main() {
    float s = sin(iParams.y), c = cos(iParams.y);
    vec2 corner = mat2(c, s, -s, c) * position.xy * iParams.x;
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    mv.xy += corner;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    vUv = vec2(uv.x * 0.5 + iParams.w * 0.5, uv.y);
    vAlpha = iParams.z;
    vColor = iColor;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uFogColor;
  uniform vec2 uFogRange;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vFogDepth;
  void main() {
    vec4 t = texture2D(map, vUv);
    float a = t.a * vAlpha;
    if (a < 0.03) discard;
    // Ink (dark texels) stays ink; white areas take the particle tint.
    vec3 col = mix(t.rgb, t.rgb * vColor, step(0.5, t.r));
    float fog = smoothstep(uFogRange.x, uFogRange.y, vFogDepth);
    gl_FragColor = vec4(mix(col, uFogColor, fog), a);
  }
`;

function atlas(puffCanvas, sparkCanvas) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.drawImage(puffCanvas, 0, 0, 128, 128);
  ctx.drawImage(sparkCanvas, 128 + 16, 16, 96, 96);
  return new CanvasTexture(c);
}

export const PUFF = 0;
export const SPARK = 1;

export class Particles {
  constructor(puffTex, sparkTex, max = 128) {
    this.max = max;
    this.pool = [];
    for (let i = 0; i < max; i++) {
      this.pool.push({ alive: false, pos: new Vector3(), vel: new Vector3(), life: 0, maxLife: 1, s0: 1, s1: 2, rot: 0, spin: 0, color: new Color(1, 1, 1), frame: 0, drag: 1, rise: 0 });
    }
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.aPos = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aParams = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
    for (const a of [this.aPos, this.aParams, this.aColor]) a.setUsage(35048); // DynamicDrawUsage
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iParams', this.aParams);
    geo.setAttribute('iColor', this.aColor);
    geo.instanceCount = 0;
    this.geometry = geo;
    const mat = new ShaderMaterial({
      uniforms: { map: { value: atlas(puffTex.image, sparkTex.image) }, uFogColor: shared.uFogColor, uFogRange: shared.uFogRange },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.cursor = 0;
  }

  spawn({ pos, vel = null, life = 0.8, size = [0.8, 2.2], color = 0xffffff, frame = PUFF, spin = 0, drag = 2.5, rise = 1.2 }) {
    let p = null;
    for (let k = 0; k < this.max; k++) {
      const cand = this.pool[(this.cursor + k) % this.max];
      if (!cand.alive) { p = cand; this.cursor = (this.cursor + k + 1) % this.max; break; }
    }
    if (!p) { p = this.pool[this.cursor]; this.cursor = (this.cursor + 1) % this.max; }
    p.alive = true;
    p.pos.copy(pos);
    if (vel) p.vel.copy(vel);
    else p.vel.set(0, 0, 0);
    p.life = 0;
    p.maxLife = life;
    p.s0 = size[0];
    p.s1 = size[1];
    p.rot = Math.random() * Math.PI * 2;
    p.spin = spin || (Math.random() - 0.5) * 2;
    p.color.set(color);
    p.frame = frame;
    p.drag = drag;
    p.rise = rise;
    return p;
  }

  clear() {
    for (const p of this.pool) p.alive = false;
    this.geometry.instanceCount = 0;
  }

  update(dt) {
    let n = 0;
    const P = this.aPos.array, Q = this.aParams.array, C = this.aColor.array;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; continue; }
      const t = p.life / p.maxLife;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y += p.rise * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.spin * dt;
      P[n * 3] = p.pos.x; P[n * 3 + 1] = p.pos.y; P[n * 3 + 2] = p.pos.z;
      // Pop in fast, shrink/fade out.
      const grow = Math.min(1, t * 6);
      Q[n * 4] = (p.s0 + (p.s1 - p.s0) * t) * (0.4 + 0.6 * grow);
      Q[n * 4 + 1] = p.rot;
      Q[n * 4 + 2] = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      Q[n * 4 + 3] = p.frame;
      C[n * 3] = p.color.r; C[n * 3 + 1] = p.color.g; C[n * 3 + 2] = p.color.b;
      n++;
    }
    this.geometry.instanceCount = n;
    if (n > 0) {
      this.aPos.needsUpdate = true;
      this.aParams.needsUpdate = true;
      this.aColor.needsUpdate = true;
    }
  }
}
