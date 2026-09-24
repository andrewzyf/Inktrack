import { ShaderMaterial, Color, Vector2, Vector3, BackSide, DoubleSide, FrontSide, MathUtils } from 'three';
import { toonVertex, toonFragment, outlineVertex, outlineFragment } from './shaders.js';

/**
 * Uniform objects shared by every toon/outline material. Updating one of
 * these (light direction, fog, viewport scale) updates the whole scene with
 * no per-material work.
 */
export const shared = {
  uLightDir: { value: new Vector3(0.45, 0.8, 0.35).normalize() },
  uMidTint: { value: new Color(0.8, 0.78, 0.86) },
  uShadowTint: { value: new Color(0.56, 0.52, 0.7) },
  uBands: { value: new Vector2(0.62, 0.36) },
  uInk: { value: new Color(0.55, 0.5, 0.66) },
  uHalftoneSize: { value: 6 },
  uHalftone: { value: 1 },
  uFogColor: { value: new Color(0xffe3b3) },
  uFogRange: { value: new Vector2(160, 520) },
  // Outline scale: world units per device pixel at 1 m from the camera.
  uPxToWorld: { value: 0.001 },
  uOutlinePx: { value: 2.5 },
  uMaxDist: { value: 45 },
  uInkColor: { value: new Color(0x141018) },
};

const toonUniformKeys = ['uLightDir', 'uMidTint', 'uShadowTint', 'uBands', 'uInk', 'uHalftoneSize', 'uHalftone', 'uFogColor', 'uFogRange'];
const outlineUniformKeys = ['uPxToWorld', 'uOutlinePx', 'uMaxDist', 'uInkColor', 'uFogColor', 'uFogRange'];

export const renderSettings = {
  halftone: true,
  outlines: true,
};

/**
 * Cel-shaded material.
 * opts: color, emissive, map, vertexColors, opacity, transparent, shine,
 *       doubleSided, halftone (default true), depthWrite
 */
export function createToonMaterial(opts = {}) {
  const uniforms = {
    uColor: { value: new Color(opts.color ?? 0xffffff) },
    uEmissive: { value: new Color(opts.emissive ?? 0x000000) },
    uOpacity: { value: opts.opacity ?? 1 },
    uShine: { value: opts.shine ?? 0 },
  };
  for (const k of toonUniformKeys) uniforms[k] = shared[k];
  const defines = {};
  if (opts.map) {
    uniforms.map = { value: opts.map };
    defines.USE_MAP = '';
  }
  if (opts.halftone !== false && renderSettings.halftone) defines.USE_HALFTONE = '';
  if (opts.shine) defines.USE_SHINE = '';
  if (opts.doubleSided) defines.DOUBLE_SIDED = '';
  const mat = new ShaderMaterial({
    name: opts.name || 'toon',
    uniforms,
    defines,
    vertexShader: toonVertex,
    fragmentShader: toonFragment,
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent || (opts.opacity ?? 1) < 1,
    depthWrite: opts.depthWrite ?? true,
    side: opts.doubleSided ? DoubleSide : FrontSide,
  });
  mat.isToon = true;
  return mat;
}

/** Ink outline (inverted hull) material. `thickness` scales the shared pixel width. */
export function createOutlineMaterial(opts = {}) {
  const uniforms = {
    uThickness: { value: opts.thickness ?? 1 },
    uOpacity: { value: opts.opacity ?? 1 },
  };
  for (const k of outlineUniformKeys) uniforms[k] = shared[k];
  if (opts.color !== undefined) uniforms.uInkColor = { value: new Color(opts.color) };
  const mat = new ShaderMaterial({
    name: 'outline',
    uniforms,
    vertexShader: outlineVertex,
    fragmentShader: outlineFragment,
    side: BackSide,
    transparent: (opts.opacity ?? 1) < 1,
    depthWrite: opts.depthWrite ?? true,
  });
  mat.isOutline = true;
  return mat;
}

let defaultOutline = null;
export function getDefaultOutlineMaterial() {
  if (!defaultOutline) defaultOutline = createOutlineMaterial();
  return defaultOutline;
}

/**
 * Keep outline widths and halftone cells a constant size in *screen* pixels.
 * Call on resize and whenever the camera FOV changes.
 */
export function updateViewportUniforms(camera, heightPx, pixelRatio) {
  const fov = MathUtils.degToRad(camera.fov);
  shared.uPxToWorld.value = (2 * Math.tan(fov / 2)) / Math.max(1, heightPx);
  shared.uHalftoneSize.value = Math.max(3, 4.5 * pixelRatio);
  shared.uOutlinePx.value = Math.max(1.5, 1.9 * pixelRatio) * (heightPx / pixelRatio < 500 ? 0.85 : 1);
}

export function setFog(color, near, far) {
  shared.uFogColor.value.set(color);
  shared.uFogRange.value.set(near, far);
}

export function setLight({ direction, midTint, shadowTint, ink } = {}) {
  if (direction) shared.uLightDir.value.copy(direction).normalize();
  if (midTint !== undefined) shared.uMidTint.value.set(midTint);
  if (shadowTint !== undefined) shared.uShadowTint.value.set(shadowTint);
  if (ink !== undefined) shared.uInk.value.set(ink);
}
