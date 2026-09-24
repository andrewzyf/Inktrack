import { GeoBuilder } from '../rendering/GeoBuilder.js';

/**
 * GeoBuilders keyed by material and spatial chunk, so static geometry
 * merges into few draw calls while distant chunks can still be culled.
 */
export class GeoSet {
  constructor(chunkSize = 80) {
    this.chunkSize = chunkSize;
    this.map = new Map();
  }

  get(material, x = 0, z = 0) {
    const cx = Math.floor(x / this.chunkSize), cz = Math.floor(z / this.chunkSize);
    const key = `${material}|${cx},${cz}`;
    let b = this.map.get(key);
    if (!b) this.map.set(key, (b = new GeoBuilder()));
    return b;
  }

  /** [{ material, builder }] for non-empty builders. */
  entries() {
    const out = [];
    for (const [key, builder] of this.map) {
      if (builder.empty) continue;
      out.push({ material: key.split('|')[0], builder });
    }
    return out;
  }

  get triangleCount() {
    let n = 0;
    for (const b of this.map.values()) n += b.idx.length / 3;
    return n;
  }
}
