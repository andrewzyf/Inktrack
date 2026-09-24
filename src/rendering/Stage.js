import { Scene, Group, Vector3 } from 'three';
import { Sky } from './Sky.js';
import { Particles } from './Particles.js';
import { SkidMarks } from './SkidMarks.js';
import { SpeedLines } from './SpeedLines.js';
import { ChaseCamera } from './ChaseCamera.js';
import { setFog, setLight } from './materials.js';
import { puffTexture, sparkTexture, blobShadowTexture, roadTexture } from './textures.js';
import { QUALITY_PRESETS } from './Renderer.js';

/**
 * The 3D world shared by racing, the menu attract mode and the editor's test
 * drive: scene graph, poster sky, particle/skid/speed-line effects and the
 * chase camera. Tracks plug their meshes into `trackGroup`.
 */
export class Stage {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new Scene();
    this.scene.name = 'stage';
    this.sky = new Sky();
    this.scene.add(this.sky.group);
    this.trackGroup = new Group();
    this.trackGroup.name = 'track';
    this.scene.add(this.trackGroup);

    this.textures = {
      puff: puffTexture(),
      spark: sparkTexture(),
      shadow: blobShadowTexture(),
      roads: {},
    };
    this.particles = new Particles(this.textures.puff, this.textures.spark, 140);
    this.scene.add(this.particles.mesh);
    this.skids = new SkidMarks(800, 2);
    this.scene.add(this.skids.mesh);
    const preset = QUALITY_PRESETS[renderer.quality] || QUALITY_PRESETS.medium;
    this.speedLines = new SpeedLines(preset.speedLines);
    this.scene.add(this.speedLines.mesh);
    this.chase = new ChaseCamera(renderer.camera);
    this.theme = null;
  }

  /** Road atlas per style, created lazily and cached. */
  roadTexture(style) {
    if (!this.textures.roads[style]) this.textures.roads[style] = roadTexture(style);
    return this.textures.roads[style];
  }

  setTheme(theme, seed = 1) {
    this.theme = theme;
    this.sky.setTheme(theme.sky, seed);
    setFog(theme.fog.color, theme.fog.near, theme.fog.far);
    setLight({
      direction: new Vector3(...theme.light.direction),
      midTint: theme.light.midTint,
      shadowTint: theme.light.shadowTint,
      ink: theme.light.ink,
    });
  }

  clearTrack() {
    for (const child of [...this.trackGroup.children]) {
      this.trackGroup.remove(child);
      child.traverse((o) => {
        if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
      });
    }
    this.particles.clear();
    this.skids.clear();
  }

  /** Per-frame effects update + render. `fx` = { speedLines: 0..1 }. */
  render(dt, fx = {}) {
    const r = this.renderer;
    this.chase.aspect = r.aspect;
    this.sky.update(dt, r.camera, r.pixelRatio);
    this.particles.update(dt);
    this.speedLines.update(dt, fx.speedLines ?? 0, r.aspect, fx.speedLineColor ?? null);
    r.updateViewport(r.camera);
    r.render(this.scene, r.camera);
  }
}
