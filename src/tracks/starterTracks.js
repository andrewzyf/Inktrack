import { runTurtle } from './Turtle.js';
import rooftopRun from './data/rooftop-run.js';

/** The built-in tracks, compiled from their turtle scripts into placements. */
const SOURCES = [rooftopRun];

export const STARTER_TRACKS = SOURCES.map((src) => ({
  id: src.id,
  name: src.name,
  theme: src.theme,
  author: src.author,
  builtIn: true,
  pieces: runTurtle(src.script, src.origin),
}));

export function getStarterTrack(id) {
  return STARTER_TRACKS.find((t) => t.id === id) || null;
}
