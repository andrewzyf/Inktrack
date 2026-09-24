import { Group, Mesh, MeshBasicMaterial, DoubleSide } from 'three';
import { createToonMaterial } from './materials.js';
import { addOutline } from './outline.js';
import { facadeTexture, signTexture, bannerTexture } from './textures.js';

/**
 * Turns a TrackBuilder result into meshes. Materials are cached per theme so
 * switching tracks doesn't recompile shaders or redraw textures.
 */
const materialCache = new Map();

export function materialsFor(stage, theme) {
  const key = theme.id;
  if (materialCache.has(key)) return materialCache.get(key);
  const mats = {
    road: createToonMaterial({ vertexColors: true, map: stage.roadTexture(theme.roadStyle), name: 'road' }),
    ice: createToonMaterial({ vertexColors: true, map: stage.roadTexture('ice'), shine: 0.6, name: 'ice' }),
    boost: createToonMaterial({ vertexColors: true, map: stage.roadTexture('boost'), emissive: 0x2a1000, halftone: false, name: 'boost' }),
    decor: createToonMaterial({ vertexColors: true, name: 'decor' }),
    facade: createToonMaterial({ vertexColors: true, map: facadeTexture(theme.facadeStyle || theme.id), name: 'facade' }),
    banner: createToonMaterial({ vertexColors: true, map: bannerTexture(), halftone: false, name: 'banner' }),
    glow: new MeshBasicMaterial({ vertexColors: true }),
    signs: new MeshBasicMaterial({ map: signTexture(theme.id), side: DoubleSide }),
  };
  materialCache.set(key, mats);
  return mats;
}

const NO_OUTLINE = new Set(['glow', 'signs']);

export function createTrackMeshes(build, stage, theme) {
  const group = new Group();
  group.name = 'trackMeshes';
  const mats = materialsFor(stage, theme);
  let triangles = 0;
  const hulls = [];
  for (const { material, builder } of build.geo.entries()) {
    const geometry = builder.toGeometry();
    const mesh = new Mesh(geometry, mats[material] || mats.decor);
    mesh.name = material;
    mesh.matrixAutoUpdate = false;
    if (!NO_OUTLINE.has(material)) {
      const hull = addOutline(mesh);
      if (hull) hulls.push({ hull, center: geometry.boundingSphere.center, radius: geometry.boundingSphere.radius });
    }
    group.add(mesh);
    triangles += geometry.index.count / 3;
  }
  group.userData.triangles = triangles;
  /**
   * Outline LOD: past `maxDist` the ink lines are thin and fogged anyway,
   * so skip those hull draws (saves vertex work and draw calls).
   */
  group.userData.updateLod = (cameraPos, maxDist = 300) => {
    for (const h of hulls) h.hull.visible = h.center.distanceTo(cameraPos) - h.radius < maxDist;
  };
  return group;
}
