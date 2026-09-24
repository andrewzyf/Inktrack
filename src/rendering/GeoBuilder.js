import { BufferGeometry, BufferAttribute, Color, Matrix3, Vector3 } from 'three';
import { computeOutlineNormals } from './outline.js';

const _p = new Vector3();
const _n = new Vector3();
const _o = new Vector3();
const _c = new Color();
const _nm = new Matrix3();

/**
 * Growable vertex/index buffers with the attribute layout every static
 * InkTrack mesh uses: position, normal, color, uv, outlineNormal.
 * Many small primitives are appended into one builder → one draw call.
 */
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.uv = [];
    this.onrm = [];
    this.idx = [];
    this.count = 0;
  }

  get empty() {
    return this.idx.length === 0;
  }

  vertex(p, n, color, u = 0.95, v = 0, on = n) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(color.r, color.g, color.b);
    this.uv.push(u, v);
    this.onrm.push(on.x, on.y, on.z);
    return this.count++;
  }

  tri(a, b, c) {
    this.idx.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.idx.push(a, b, c, a, c, d);
  }

  /**
   * Append a (primitive) BufferGeometry transformed by `matrix`, tinted with
   * `color` (multiplied with any vertex colours it has). Hard-edged primitives
   * get averaged outline normals first so their hulls stay closed.
   */
  append(geometry, matrix, color = 0xffffff, uvOverride = null) {
    computeOutlineNormals(geometry);
    const pos = geometry.getAttribute('position');
    const nrm = geometry.getAttribute('normal');
    const onr = geometry.getAttribute('outlineNormal');
    const col = geometry.getAttribute('color');
    const uv = geometry.getAttribute('uv');
    const tint = _c.set(color);
    const tr = tint.r, tg = tint.g, tb = tint.b;
    _nm.getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      _n.fromBufferAttribute(nrm, i).applyMatrix3(_nm).normalize();
      _o.fromBufferAttribute(onr, i).applyMatrix3(_nm).normalize();
      this.pos.push(_p.x, _p.y, _p.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      this.onrm.push(_o.x, _o.y, _o.z);
      if (col) this.col.push(col.getX(i) * tr, col.getY(i) * tg, col.getZ(i) * tb);
      else this.col.push(tr, tg, tb);
      if (uvOverride) this.uv.push(uvOverride[0], uvOverride[1]);
      else if (uv) this.uv.push(uv.getX(i), uv.getY(i));
      else this.uv.push(0.95, 0);
    }
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    this.count += pos.count;
    // Mirrored transforms flip winding.
    if (matrix.determinant() < 0) {
      for (let i = this.idx.length - (index ? index.count : pos.count); i < this.idx.length; i += 3) {
        const t = this.idx[i + 1];
        this.idx[i + 1] = this.idx[i + 2];
        this.idx[i + 2] = t;
      }
    }
  }

  toGeometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('outlineNormal', new BufferAttribute(new Float32Array(this.onrm), 3));
    const IndexArray = this.count > 65535 ? Uint32Array : Uint16Array;
    g.setIndex(new BufferAttribute(new IndexArray(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
