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
};

export function getTheme(id) {
  return THEMES[id] || THEMES.rooftop;
}
