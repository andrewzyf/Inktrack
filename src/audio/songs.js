/**
 * Song book for the music engine. Each song is a small arrangement:
 * tempo, key, chord progression, per-section instrument patterns and
 * melodic motifs. Patterns are 16-step strings (one bar of 16ths):
 *   'x' hit · 'o' accent · '.' rest · '-' (lead/bass) hold previous note
 * Chords are scale degrees (1-7) with optional quality suffix handled by the
 * scale; `lead` motifs are scale-step offsets from the chord root ('.' rests).
 */

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygianDom: [0, 1, 4, 5, 7, 8, 10],
};

const FOUR = 'x...x...x...x...';
const BACKBEAT = '....x.......x...';
const EIGHTHS = 'x.x.x.x.x.x.x.x.';
const OFFBEATS = '..x...x...x...x.';

export const SONGS = {
  menu: {
    name: 'Ink Lounge',
    bpm: 100,
    swing: 0.12,
    root: 50, // D3
    scale: 'dorian',
    chords: [1, 4, 7, 5],
    instruments: { bass: 'round', chord: 'ep', lead: 'bell', arp: null },
    sections: [
      { bars: 8, kick: 'x......x..x.....', snare: BACKBEAT, hat: '..x...x...x...xx', bass: 'o..o..o...o.o...', chord: 'x.....x.....x...', lead: null },
      { bars: 8, kick: 'x......x..x.....', snare: BACKBEAT, hat: 'x.xxx.x.x.xxx.x.', bass: 'o..o..o...o.o...', chord: 'x.....x.....x...', lead: [0, '.', 2, 4, '.', 2, '.', '.', 4, '.', 3, 2, '.', 0, '.', '.'] },
    ],
  },
  rooftop: {
    name: 'Neon Rooftops',
    bpm: 128,
    swing: 0,
    root: 41, // F2
    scale: 'minor',
    chords: [1, 6, 3, 7],
    instruments: { bass: 'saw', chord: 'pad', lead: 'square', arp: 'pluck' },
    sections: [
      { bars: 4, kick: FOUR, snare: null, hat: OFFBEATS, bass: 'o.o.o.o.o.o.o.o.', chord: 'x...............', arp: null, lead: null },
      { bars: 8, kick: FOUR, snare: BACKBEAT, hat: EIGHTHS, bass: 'o.oo.oo.o.oo.oo.', chord: 'x...............', arp: 'xxxxxxxxxxxxxxxx', lead: [4, '-', '-', 2, '-', 0, '-', '-', 2, '-', 4, '-', 5, '-', 4, '-'] },
      { bars: 8, kick: FOUR, snare: 'x...x...x...x.xx', hat: EIGHTHS, bass: 'o.oo.oo.o.oo.oo.', chord: 'x.......x.......', arp: 'xxxxxxxxxxxxxxxx', lead: [7, '-', 6, 4, '-', 2, 4, '-', 6, '-', 7, '-', 9, '-', 7, '-'] },
    ],
  },
  ruins: {
    name: 'Temple Rush',
    bpm: 116,
    swing: 0.08,
    root: 45, // A2
    scale: 'dorian',
    chords: [1, 6, 7, 5],
    instruments: { bass: 'round', chord: 'marimba', lead: 'flute', arp: 'marimba', toms: true },
    sections: [
      { bars: 4, kick: 'x..x..x.x..x....', snare: null, hat: '..x...x...x...x.', tom: 'x.x..x.x..x.x.xx', bass: 'o...o...o..o....', chord: 'x..x..x.x..x....', lead: null },
      { bars: 8, kick: 'x..x..x.x..x....', snare: BACKBEAT, hat: EIGHTHS, tom: '..........x.x.xx', bass: 'o..o..o.o..o..o.', chord: 'x..x..x.x..x..x.', arp: 'x.xxx.xxx.xxx.x.', lead: [0, '-', 2, 3, '-', 4, '-', '-', 3, 2, '-', 0, '-', '.', 4, 2] },
      { bars: 8, kick: 'x..x..x.x..x.x..', snare: 'x...x...x...x...', hat: EIGHTHS, tom: 'x.x.x.x.....xxxx', bass: 'o..o..o.o..o..o.', chord: 'x..x..x.x..x..x.', arp: 'x.xxx.xxx.xxx.x.', lead: [7, '-', 6, 4, '-', 3, 4, '-', 2, '-', 0, '-', 2, 3, 4, '-'] },
    ],
  },
  frost: {
    name: 'Ice Rush',
    bpm: 142,
    swing: 0,
    root: 49, // C#3
    scale: 'minor',
    chords: [1, 6, 3, 7],
    instruments: { bass: 'square', chord: 'glass', lead: 'chip', arp: 'chip' },
    sections: [
      { bars: 4, kick: 'x.......x.......', snare: null, hat: EIGHTHS, bass: 'o.o.o.o.o.o.o.o.', chord: 'x.......x.......', arp: 'x.x.x.x.x.x.x.x.', lead: null },
      { bars: 8, kick: FOUR, snare: BACKBEAT, hat: 'xxxxxxxxxxxxxxxx', bass: 'o.oo.oo.o.oo.oo.', chord: 'x.......x.......', arp: 'xxxxxxxxxxxxxxxx', lead: [0, 2, 4, '-', 7, '-', 4, 2, 4, '-', '-', 5, 4, '-', 2, '-'] },
      { bars: 8, kick: FOUR, snare: 'x...x...x...x.x.', hat: 'xxxxxxxxxxxxxxxx', bass: 'oo.oo.oo.oo.oo.o', chord: 'x...x...x...x...', arp: 'xxxxxxxxxxxxxxxx', lead: [9, '-', 7, '-', 5, '-', 4, '-', 5, 7, 9, '-', 11, '-', 9, '-'] },
    ],
  },
  canyon: {
    name: 'Dust Devil',
    bpm: 112,
    swing: 0.1,
    root: 40, // E2
    scale: 'phrygianDom',
    chords: [1, 6, 7, 1],
    instruments: { bass: 'pick', chord: 'twang', lead: 'twang', arp: null },
    sections: [
      { bars: 4, kick: 'x...x...x...x...', snare: null, hat: 'x.x.x.x.x.x.x.x.', bass: 'o.o.o.o.o.o.oooo', chord: 'x...............', lead: null },
      { bars: 8, kick: 'x..xx...x..xx...', snare: BACKBEAT, hat: 'x.xxx.xxx.xxx.xx', bass: 'o.o.o.o.o.o.oooo', chord: 'x..x..x.........', lead: [0, 1, 2, '-', 4, '-', 2, 1, 0, '-', '.', '.', 4, 5, 4, '-'] },
      { bars: 8, kick: 'x..xx...x..xx...', snare: 'x...x...x...xxxx', hat: 'x.xxx.xxx.xxx.xx', bass: 'o.o.o.o.o.o.oooo', chord: 'x..x..x...x.....', lead: [7, '-', 5, 4, '-', 2, 1, '-', 2, 4, '-', 5, 4, 2, 1, 0] },
    ],
  },
  ocean: {
    name: 'Tidal Wave',
    bpm: 122,
    swing: 0.05,
    root: 48, // C3
    scale: 'major',
    chords: [1, 6, 4, 5],
    instruments: { bass: 'round', chord: 'pluck', lead: 'bell', arp: 'pluck' },
    sections: [
      { bars: 4, kick: FOUR, snare: null, hat: OFFBEATS, bass: 'o.....o...o.....', chord: '..x...x...x...x.', lead: null },
      { bars: 8, kick: FOUR, snare: '....x.......x...', hat: OFFBEATS, bass: 'o.....o...o..o..', chord: '..x..xx...x..x.x', arp: 'x..x..x..x..x.x.', lead: [4, '-', 2, '-', 0, '-', 2, 4, 5, '-', 4, '-', 2, '-', '.', '.'] },
      { bars: 8, kick: FOUR, snare: '....x.......x...', hat: EIGHTHS, bass: 'o.....o...o..o..', chord: '..x..xx...x..x.x', arp: 'x..x..x..x..x.x.', lead: [7, '-', 9, 7, 4, '-', 2, '-', 4, '-', 5, 4, 2, '-', 0, '-'] },
    ],
  },
  sky: {
    name: 'Cloud Nine',
    bpm: 132,
    swing: 0,
    root: 46, // Bb2
    scale: 'major',
    chords: [1, 5, 6, 4],
    instruments: { bass: 'saw', chord: 'pad', lead: 'square', arp: 'pluck' },
    sections: [
      { bars: 4, kick: 'x.......x.......', snare: null, hat: OFFBEATS, bass: 'o.......o.......', chord: 'x...............', arp: 'x.x.x.x.x.x.x.x.', lead: null },
      { bars: 8, kick: FOUR, snare: BACKBEAT, hat: EIGHTHS, bass: 'o.o.o.o.o.o.o.o.', chord: 'x.......x.......', arp: 'xxxxxxxxxxxxxxxx', lead: [4, '-', '-', 5, 4, '-', 2, '-', 0, '-', '-', 2, 4, '-', 7, '-'] },
      { bars: 8, kick: FOUR, snare: 'x...x...x...x.xx', hat: EIGHTHS, bass: 'o.oo.oo.o.oo.oo.', chord: 'x...x...x...x...', arp: 'xxxxxxxxxxxxxxxx', lead: [9, '-', 7, '-', 9, 11, 9, '-', 7, '-', 4, '-', 5, '-', 7, '-'] },
    ],
  },
};

/** Which song plays where (tracks pick by theme). */
export function songForTheme(themeId) {
  return SONGS[themeId] ? themeId : 'rooftop';
}
