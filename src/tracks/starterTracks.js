import { runTurtle } from './Turtle.js';
import rooftopRun from './data/rooftop-run.js';
import ruinRally from './data/ruin-rally.js';
import frostPeak from './data/frost-peak.js';
import canyonBlitz from './data/canyon-blitz.js';
import tidalRun from './data/tidal-run.js';
import cloudCircuit from './data/cloud-circuit.js';
import PAR from './data/par.js';

/** The built-in tracks, compiled from their turtle scripts into placements. */
const SOURCES = [rooftopRun, ruinRally, frostPeak, canyonBlitz, tidalRun, cloudCircuit];

export const STARTER_TRACKS = SOURCES.map((src) => ({
  id: src.id,
  name: src.name,
  theme: src.theme,
  author: src.author,
  builtIn: true,
  par: PAR[src.id] ?? null,
  blurb: src.blurb || '',
  pieces: runTurtle(src.script, src.origin),
}));

export function getStarterTrack(id) {
  return STARTER_TRACKS.find((t) => t.id === id) || null;
}
