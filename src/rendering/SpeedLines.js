import { BufferGeometry, BufferAttribute, Mesh, ShaderMaterial, Color } from 'three';

/**
 * Comic speed lines radiating from the screen edges. Built directly in clip
 * space (one draw call, ~130 triangles, only covers the screen border), so it
 * costs a fraction of a full-screen post effect.
 */

const vertex = /* glsl */ `
  attribute vec3 corner;  // x: 0 inner / 1 outer end, y: -1/+1 side
  attribute vec4 line;    // angle, phase, speed, width
  uniform float uTime;
  uniform float uIntensity;
  uniform float uAspect;
  varying float vAlpha;
  void main() {
    float ph = fract(uTime * line.z + line.y);
    float len = 0.28 + 0.35 * fract(line.y * 7.13);
    float r = mix(0.72, 1.25, ph) + corner.x * len;
    vec2 dir = vec2(cos(line.x), sin(line.x));
    vec2 perp = vec2(-dir.y, dir.x);
    float w = line.w * corner.x * (0.6 + uIntensity * 0.8);
    vec2 off = perp * w * corner.y;
    off.x /= uAspect; // keep strokes the same pixel width on any aspect
    vec2 p = dir * r + off;
    gl_Position = vec4(p, 0.0, 1.0);
    float fade = smoothstep(0.0, 0.25, ph) * (1.0 - smoothstep(0.65, 1.0, ph));
    vAlpha = fade * clamp(uIntensity * 1.4 - fract(line.y * 3.7) * 0.9, 0.0, 1.0) * (0.35 + 0.65 * corner.x);
  }
`;
const fragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

export class SpeedLines {
  constructor(count = 56) {
    const corners = new Float32Array(count * 4 * 3);
    const lines = new Float32Array(count * 4 * 4);
    const index = new Uint16Array(count * 6);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.09;
      const phase = Math.random();
      const speed = 1.4 + Math.random() * 1.2;
      const width = 0.004 + Math.random() * 0.01;
      const quad = [[0, -1], [1, -1], [1, 1], [0, 1]];
      for (let k = 0; k < 4; k++) {
        corners.set([quad[k][0], quad[k][1], 0], (i * 4 + k) * 3);
        lines.set([angle, phase, speed, width], (i * 4 + k) * 4);
      }
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('corner', new BufferAttribute(corners, 3));
    geo.setAttribute('line', new BufferAttribute(lines, 4));
    // `position` is required by three.js even though the shader ignores it.
    geo.setAttribute('position', new BufferAttribute(corners, 3));
    geo.setIndex(new BufferAttribute(index, 1));
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uAspect: { value: 16 / 9 },
        uColor: { value: new Color(0x141018) },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.intensity = 0;
    this.mesh.visible = false;
  }

  /** target: 0 (none) … 1 (full boost). */
  update(dt, target, aspect, color = null) {
    this.intensity += (target - this.intensity) * (1 - Math.exp(-(target > this.intensity ? 6 : 3) * dt));
    const u = this.material.uniforms;
    u.uTime.value += dt;
    u.uIntensity.value = this.intensity;
    u.uAspect.value = aspect;
    if (color !== null) u.uColor.value.set(color);
    this.mesh.visible = this.intensity > 0.02;
  }
}
