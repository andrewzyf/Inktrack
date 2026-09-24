import { BufferGeometry, BufferAttribute, Mesh, ShaderMaterial, Vector3, Color, DoubleSide } from 'three';
import { shared } from './materials.js';

/**
 * Thick "ink stroke" skid marks: a ring buffer of quads laid on the road
 * behind each rear wheel. Strokes taper in and out like a brush pen.
 */

const vertex = /* glsl */ `
  attribute float alpha;
  varying float vAlpha;
  varying float vFogDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mv.z;
    vAlpha = alpha;
    gl_Position = projectionMatrix * mv;
  }
`;
const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uFogColor;
  uniform vec2 uFogRange;
  varying float vAlpha;
  varying float vFogDepth;
  void main() {
    float fog = smoothstep(uFogRange.x, uFogRange.y, vFogDepth);
    gl_FragColor = vec4(mix(uColor, uFogColor, fog), vAlpha * uOpacity);
  }
`;

const _side = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _L = new Vector3();
const _R = new Vector3();

export class SkidMarks {
  constructor(maxSegments = 700, trails = 2) {
    this.max = maxSegments;
    this.positions = new Float32Array(maxSegments * 4 * 3);
    this.alphas = new Float32Array(maxSegments * 4);
    const idx = new Uint16Array(maxSegments * 6);
    for (let i = 0; i < maxSegments; i++) {
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const geo = new BufferGeometry();
    this.posAttr = new BufferAttribute(this.positions, 3).setUsage(35048);
    this.alphaAttr = new BufferAttribute(this.alphas, 1).setUsage(35048);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('alpha', this.alphaAttr);
    geo.setIndex(new BufferAttribute(idx, 1));
    this.geometry = geo;
    this.mesh = new Mesh(
      geo,
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color(0x141018) }, uOpacity: { value: 0.82 }, uFogColor: shared.uFogColor, uFogRange: shared.uFogRange },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.next = 0;
    this.trails = Array.from({ length: trails }, () => ({ active: false, last: new Vector3(), lastL: new Vector3(), lastR: new Vector3(), width: 0, len: 0 }));
  }

  clear() {
    this.alphas.fill(0);
    this.alphaAttr.needsUpdate = true;
    for (const t of this.trails) t.active = false;
  }

  /**
   * Feed a wheel contact point. `on` false ends the stroke (tapering out).
   * point/normal in world space; strength 0..1 scales stroke width.
   */
  update(trail, on, point, normal, strength = 1) {
    const t = this.trails[trail];
    if (!on) {
      t.active = false;
      return;
    }
    const targetW = 0.2 + 0.1 * strength;
    if (!t.active) {
      t.active = true;
      t.width = 0.02; // taper in
      t.len = 0;
      t.last.copy(point).addScaledVector(normal, 0.035);
      this._edges(t, t.last, normal, point, t.width, t.lastL, t.lastR, true);
      return;
    }
    _a.copy(point).addScaledVector(normal, 0.035);
    const d = _a.distanceTo(t.last);
    if (d < 0.35) return; // wait for a meaningful segment
    if (d > 6) { t.active = false; return; } // respawn / teleport
    t.width += (targetW - t.width) * Math.min(1, d * 0.6);
    this._edges(t, _a, normal, t.last, t.width, _L, _R, false);
    this._segment(t.lastL, t.lastR, _R, _L, 0.95);
    t.lastL.copy(_L);
    t.lastR.copy(_R);
    t.last.copy(_a);
    t.len += d;
  }

  _edges(t, p, normal, from, width, outL, outR, first) {
    if (first) _dir.set(1, 0, 0);
    else _dir.subVectors(p, from).normalize();
    _side.crossVectors(_dir, normal);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    _side.normalize().multiplyScalar(width / 2);
    outL.copy(p).sub(_side);
    outR.copy(p).add(_side);
  }

  _segment(a, b, c, d, alpha) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const P = this.positions;
    const o = i * 12;
    P[o] = a.x; P[o + 1] = a.y; P[o + 2] = a.z;
    P[o + 3] = b.x; P[o + 4] = b.y; P[o + 5] = b.z;
    P[o + 6] = c.x; P[o + 7] = c.y; P[o + 8] = c.z;
    P[o + 9] = d.x; P[o + 10] = d.y; P[o + 11] = d.z;
    this.alphas.fill(alpha, i * 4, i * 4 + 4);
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}
