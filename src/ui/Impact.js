/**
 * Comic "impact" bubbles: jagged starburst panels with bold lettering that
 * pop, wobble and vanish (ZOOM!, DRIFT!, CHECK!, SPLAT!). Pure DOM/SVG + CSS
 * animation — cheap because they're short-lived and few.
 */

const PRESETS = {
  checkpoint: { fill: '#ffd23f', text: '#141018', spikes: 14 },
  boost: { fill: '#ff7a1a', text: '#fff6d8', spikes: 16 },
  drift: { fill: '#3df2ff', text: '#141018', spikes: 12 },
  driftBoost: { fill: '#ff3d7f', text: '#fff6d8', spikes: 16 },
  crash: { fill: '#ff4d5a', text: '#fff6d8', spikes: 18 },
  fall: { fill: '#b86bff', text: '#fff6d8', spikes: 18 },
  finish: { fill: '#7cff6b', text: '#141018', spikes: 20 },
  record: { fill: '#ffd23f', text: '#ff3d7f', spikes: 22 },
  count: { fill: '#ffffff', text: '#141018', spikes: 12 },
  go: { fill: '#7cff6b', text: '#141018', spikes: 16 },
  info: { fill: '#ffffff', text: '#141018', spikes: 10 },
};

function starburst(spikes, jag, seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 48 + rand() * 2 : 48 - jag - rand() * 8;
    pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r * 0.62).toFixed(1)}`);
  }
  return pts.join(' ');
}

export class ImpactLayer {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'impact-layer';
    parent.appendChild(this.el);
    this.seed = 12345;
    this.active = [];
  }

  /**
   * text: lettering · kind: preset · opts: { x, y (0..1 of screen), size (vmin), sub, duration }
   */
  show(text, kind = 'info', opts = {}) {
    const p = PRESETS[kind] || PRESETS.info;
    const el = document.createElement('div');
    el.className = `impact impact-${kind}`;
    const x = opts.x ?? 0.5, y = opts.y ?? 0.32;
    const rot = opts.rotate ?? (Math.random() - 0.5) * 16;
    el.style.left = `${x * 100}%`;
    el.style.top = `${y * 100}%`;
    el.style.setProperty('--rot', `${rot}deg`);
    el.style.setProperty('--size', `${opts.size ?? 13}vmin`);
    el.style.setProperty('--dur', `${opts.duration ?? 900}ms`);
    this.seed = (this.seed * 48271) % 2147483647;
    el.innerHTML = `
      <svg viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="${starburst(p.spikes, 13, this.seed)}" transform="translate(3,3)" fill="#141018" />
        <polygon points="${starburst(p.spikes, 13, this.seed)}" fill="${p.fill}" stroke="#141018" stroke-width="2.4" stroke-linejoin="round" />
      </svg>
      <span class="impact-text" style="color:${p.text}">${escapeHtml(text)}${opts.sub ? `<small>${escapeHtml(opts.sub)}</small>` : ''}</span>`;
    this.el.appendChild(el);
    this.active.push(el);
    if (this.active.length > 5) this.active.shift().remove();
    setTimeout(() => {
      el.remove();
      this.active = this.active.filter((a) => a !== el);
    }, opts.duration ?? 900);
    return el;
  }

  clear() {
    for (const el of this.active) el.remove();
    this.active = [];
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
