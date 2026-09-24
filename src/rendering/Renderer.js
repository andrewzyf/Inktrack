import { WebGLRenderer, ColorManagement, LinearSRGBColorSpace, PerspectiveCamera } from 'three';
import { updateViewportUniforms } from './materials.js';
import { fitFov } from './ChaseCamera.js';

// Comic colours are authored as flat sRGB hex values and shaded with simple
// multipliers, so we work directly in display space (no linear conversion).
ColorManagement.enabled = false;

export const QUALITY_PRESETS = {
  low: { maxPixelRatio: 1, antialias: false, speedLines: 32 },
  medium: { maxPixelRatio: 1.5, antialias: true, speedLines: 48 },
  high: { maxPixelRatio: 2, antialias: true, speedLines: 56 },
};

export function detectDefaultQuality() {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 'medium' : 'high';
}

/**
 * Owns the WebGL context, sizing and the pixel-ratio policy. `resolutionScale`
 * is adjusted at runtime by the performance governor (Phase 9) to hold 60 fps.
 */
export class Renderer {
  constructor(canvas, quality = detectDefaultQuality()) {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;
    this.gl = new WebGLRenderer({
      canvas,
      antialias: preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.gl.outputColorSpace = LinearSRGBColorSpace;
    this.gl.setClearColor(0x141018, 1);
    this.canvas = canvas;
    this.resolutionScale = 1;
    this.maxPixelRatio = preset.maxPixelRatio;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.camera = new PerspectiveCamera(66, 1, 0.1, 1400);
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(this._onResize, 150));
    this.resize();
  }

  setResolutionScale(s) {
    this.resolutionScale = Math.max(0.5, Math.min(1, s));
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio) * this.resolutionScale;
    this.gl.setPixelRatio(this.pixelRatio);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateViewport(this.camera);
  }

  get aspect() {
    return this.width / this.height;
  }

  /** Call after changing a camera's FOV so outline widths stay in pixels. */
  updateViewport(camera) {
    updateViewportUniforms(camera, this.height * this.pixelRatio, this.pixelRatio);
  }

  /** Point a free camera (e.g. editor) with portrait-friendly FOV. */
  applyFov(camera, vFov) {
    camera.aspect = this.aspect;
    camera.fov = fitFov(vFov, camera.aspect);
    camera.updateProjectionMatrix();
    this.updateViewport(camera);
  }

  render(scene, camera) {
    this.gl.render(scene, camera);
  }

  get info() {
    return this.gl.info.render;
  }
}
