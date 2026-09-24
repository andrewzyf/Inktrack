/**
 * Visual themes: sky poster, fog, lighting and track palette. Decor
 * generators per theme live in `decor.js`.
 */
export const THEMES = {
  rooftop: {
    id: 'rooftop',
    name: 'City Rooftops',
    roadStyle: 'rooftop',
    light: { direction: [-0.55, 0.62, 0.4], midTint: 0xd9c9e6, shadowTint: 0x8d77b6, ink: 0x6a4f93 },
    fog: { color: 0xf7a585, near: 170, far: 560 },
    palette: {
      wallInner: 0xe4def0, wallTop: 0xff4d5a, wallTopAlt: 0xfff4e0, wallOuter: 0xa99cc9,
      bottom: 0x3b3052, edge: 0x7d6fa3,
    },
    sky: {
      top: 0x3c2f7a, horizon: 0xffa27a, bottom: 0x2b2146,
      sun: { color: 0xffe066, azimuth: -0.55, elevation: 0.12, size: 0.075 },
      layers: [
        { type: 'clouds', radius: 820, height: 240, y: 150, color: '#ffd9c7', shade: 'rgba(160,110,170,0.4)', repeat: 3, count: 6, drift: 0.004, pixelHeight: 256 },
        { type: 'city', radius: 760, height: 190, y: -70, color: '#8466b5', windows: '#ffe38a', tall: 0.6, repeat: 3 },
        { type: 'city', radius: 690, height: 140, y: -80, color: '#4b3a78', windows: '#ffd23f', tall: 0.45, repeat: 4 },
      ],
    },
  },
  ruins: {
    id: 'ruins',
    name: 'Jungle Ruins',
    roadStyle: 'ruins',
    light: { direction: [0.5, 0.75, -0.3], midTint: 0xd8e3b8, shadowTint: 0x7f9a6a, ink: 0x4f6b3f },
    fog: { color: 0xd9efb8, near: 150, far: 520 },
    palette: {
      wallInner: 0xd7c49a, wallTop: 0x8fbf4a, wallTopAlt: 0xb7d86a, wallOuter: 0xa48a5c,
      bottom: 0x4a3a28, edge: 0x8a7148,
    },
    sky: {
      top: 0x5fc2c9, horizon: 0xf2f0b0, bottom: 0x2f5a3a,
      sun: { color: 0xfff7c2, azimuth: 1.2, elevation: 0.5, size: 0.09 },
      layers: [
        { type: 'clouds', radius: 820, height: 240, y: 160, color: '#ffffff', repeat: 3, count: 5, drift: 0.003, pixelHeight: 256 },
        { type: 'mountains', radius: 780, height: 220, y: -60, color: '#6f9f7a', peaks: 6, repeat: 2, minH: 0.2, varH: 0.4 },
        { type: 'jungle', radius: 700, height: 150, y: -70, color: '#2f6b3c', back: '#4c8c4a', temple: '#8f8a6a', temples: 1, repeat: 3 },
      ],
    },
  },
  frost: {
    id: 'frost',
    name: 'Snowy Peaks',
    roadStyle: 'frost',
    light: { direction: [0.3, 0.7, 0.55], midTint: 0xdce6f7, shadowTint: 0x93a8d6, ink: 0x5d77b8 },
    fog: { color: 0xe6f0ff, near: 140, far: 500 },
    palette: {
      wallInner: 0xf4f8ff, wallTop: 0x3f7fd9, wallTopAlt: 0xffffff, wallOuter: 0xb9c9e6,
      bottom: 0x4a5a80, edge: 0x8ea3cc,
    },
    sky: {
      top: 0x7fb2f0, horizon: 0xf3f7ff, bottom: 0x9fb4d8,
      sun: { color: 0xffffff, azimuth: 2.4, elevation: 0.35, size: 0.07 },
      layers: [
        { type: 'clouds', radius: 820, height: 240, y: 170, color: '#ffffff', shade: 'rgba(120,140,200,0.35)', repeat: 3, count: 6, drift: 0.005, pixelHeight: 256 },
        { type: 'mountains', radius: 780, height: 300, y: -90, color: '#8fa6d9', snow: '#ffffff', peaks: 7, repeat: 2, minH: 0.3, varH: 0.5 },
        { type: 'mountains', radius: 700, height: 200, y: -90, color: '#5f78b8', snow: '#f4f8ff', peaks: 9, repeat: 2, minH: 0.2, varH: 0.4 },
      ],
    },
  },
  canyon: {
    id: 'canyon',
    name: 'Red Canyon',
    roadStyle: 'canyon',
    facadeStyle: 'canyon',
    light: { direction: [-0.4, 0.8, -0.35], midTint: 0xf2cfa3, shadowTint: 0xb86a4f, ink: 0x6b2f22 },
    fog: { color: 0xffd3a1, near: 170, far: 600 },
    palette: {
      wallInner: 0xf2dcc0, wallTop: 0x2fb5a8, wallTopAlt: 0xfff1d8, wallOuter: 0xc48a60,
      bottom: 0x5c2c1c, edge: 0x9a5a3a,
    },
    sky: {
      top: 0x3f8fd6, horizon: 0xffd89a, bottom: 0x9a4a2a,
      sun: { color: 0xfff1b0, azimuth: -2.2, elevation: 0.28, size: 0.1 },
      layers: [
        { type: 'clouds', radius: 820, height: 240, y: 170, color: '#fff4e0', shade: 'rgba(200,120,80,0.35)', repeat: 3, count: 4, drift: 0.003, pixelHeight: 256 },
        { type: 'mesas', radius: 780, height: 240, y: -80, color: '#d9885a', band: 'rgba(150,60,30,0.35)', repeat: 2 },
        { type: 'mesas', radius: 700, height: 170, y: -80, color: '#b3593a', band: 'rgba(110,40,20,0.4)', repeat: 3 },
      ],
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Tropic Bay',
    roadStyle: 'water',
    facadeStyle: 'ruins',
    vehicle: 'boat',
    light: { direction: [0.45, 0.8, 0.3], midTint: 0xd8f0f0, shadowTint: 0x6fa9c9, ink: 0x1d4f7a },
    fog: { color: 0xc9f1ff, near: 190, far: 650 },
    palette: {
      wallInner: 0xffffff, wallTop: 0xff5a4a, wallTopAlt: 0xffffff, wallOuter: 0xf7f2e6,
      bottom: 0x7a5236, edge: 0x9b7050, road: 0xffffff,
    },
    sky: {
      top: 0x2f9fe8, horizon: 0xdff8ff, bottom: 0x3aa0e4,
      sun: { color: 0xfffbd0, azimuth: 0.9, elevation: 0.45, size: 0.09 },
      layers: [
        { type: 'clouds', radius: 820, height: 240, y: 150, color: '#ffffff', shade: 'rgba(90,160,220,0.35)', repeat: 3, count: 6, drift: 0.005, pixelHeight: 256 },
        { type: 'islands', radius: 760, height: 160, y: -70, color: '#58b35a', leaves: '#2f8f4a', sea: '#3aa0e4', repeat: 2 },
      ],
    },
  },
  sky: {
    id: 'sky',
    name: 'Cloud Kingdom',
    roadStyle: 'plain',
    facadeStyle: 'ruins',
    vehicle: 'plane',
    light: { direction: [0.3, 0.85, 0.4], midTint: 0xe8e6ff, shadowTint: 0x9d93d9, ink: 0x4c3f99 },
    fog: { color: 0xd8e6ff, near: 220, far: 760 },
    palette: {},
    sky: {
      top: 0x6f7ef2, horizon: 0xffe2f1, bottom: 0xbfd2ff,
      sun: { color: 0xfff6c9, azimuth: 2.0, elevation: 0.3, size: 0.08 },
      layers: [
        { type: 'clouds', radius: 820, height: 260, y: 120, color: '#ffffff', shade: 'rgba(140,130,220,0.35)', repeat: 3, count: 7, drift: 0.006, pixelHeight: 256 },
        { type: 'clouds', radius: 740, height: 220, y: -40, color: '#fff3fb', shade: 'rgba(170,140,220,0.35)', repeat: 3, count: 8, drift: -0.004, pixelHeight: 256 },
        { type: 'clouds', radius: 680, height: 200, y: -150, color: '#f1f0ff', shade: 'rgba(120,120,200,0.35)', repeat: 4, count: 9, drift: 0.003, pixelHeight: 256 },
      ],
    },
  },
};

/** Theme ids players can pick in the editor, grouped by mode. */
export const THEME_ORDER = ['rooftop', 'ruins', 'frost', 'canyon', 'ocean', 'sky'];

export function getTheme(id) {
  return THEMES[id] || THEMES.rooftop;
}

/** A darkened "Night Ink" copy of a theme (mutator). */
export function nightTheme(theme) {
  const dim = (hex, k = 0.32, blue = 0.12) => {
    const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
    const to = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    return (to(r * k) << 16) | (to(g * k + blue * 0.3) << 8) | to(b * k + blue);
  };
  const dimCss = (css) => (typeof css === 'string' && /^#[0-9a-f]{6}$/i.test(css) ? '#' + dim(parseInt(css.slice(1), 16), 0.4, 0.1).toString(16).padStart(6, '0') : css);
  return {
    ...theme,
    id: theme.id,
    night: true,
    light: { ...theme.light, midTint: dim(theme.light.midTint, 0.45, 0.18), shadowTint: dim(theme.light.shadowTint, 0.3, 0.15), ink: 0x0b0918, litTint: 0x8d8fc4 },
    fog: { color: 0x14123a, near: theme.fog.near * 0.6, far: theme.fog.far * 0.75 },
    sky: {
      ...theme.sky,
      top: 0x07061c, horizon: 0x2c2466, bottom: 0x0b0a20,
      sun: { color: 0xf6f1c8, azimuth: theme.sky.sun.azimuth + 1, elevation: 0.4, size: 0.05 },
      layers: theme.sky.layers.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, dimCss(v)]))),
    },
  };
}
