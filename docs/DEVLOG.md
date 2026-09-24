# InkTrack — development log

One entry per build phase: what was built, the trade-offs taken, and anything
that needs a decision from the project owner.

## Phase 1 — Project scaffold

**Built**
- Vite + Three.js project (`npm run dev`, `npm run build`, `npm test`).
- Folder layout from the brief (`src/physics`, `rendering`, `tracks`, `editor`,
  `ui`, `input`, `replay`, `storage`, plus `src/config`, `src/core`, `src/race`,
  `src/audio`) and `/assets` (fonts bundled locally, OFL licences included).
- `CollisionWorld`: triangle soup + 3D spatial hash, DDA ray casts and sphere
  queries, smooth (interpolated) contact normals. Allocation-free hot path.
- `CarPhysics` v1: four wheel rays, ride-height constraint, accel curve, brakes,
  reverse, speed-scaled steering, lateral grip.
- Fixed-timestep `GameLoop` (120 Hz physics, interpolated rendering) and a
  smoothed `ChaseCamera`.
- Placeholder box car on a flat 1 km plane, keyboard input (WASD / arrows).

**Verified**
- `tests/phase1-driving.test.js`: rests at ride height, accelerates along +Z,
  brakes (> 30 m/s²) then reverses, steering direction correct, no steering at
  standstill, never exceeds top speed while turning.
- `scripts/verify-phase1.mjs` drives the real build in headless Chromium.

**Decision: custom arcade physics instead of cannon-es.**
A general rigid-body solver fights the PolyTrack feel: loops need the car to
stick to arbitrary surfaces, high speeds tunnel through thin track pieces, and
grip/drift have to be tuned through friction coefficients rather than directly.
The custom controller is a point mass with a kinematically aligned chassis:
~8 ray casts and 6 sphere tests per tick, no broadphase over dynamic bodies,
and every feel parameter is a direct number in `src/config/physics.js`.
Cost: no general body-body physics (not needed — there is one car and ghosts
are non-colliding).

**Bug caught during verification:** the first grip model converted scrubbed
sideways speed into forward speed and gained energy in turns (75 m/s against a
58 m/s top speed). Replaced with a speed-conserving redirect; regression test
added.

## Phase 2 — Core driving physics

**Built** (`src/physics/CarPhysics.js`, all constants in `src/config/physics.js`)
- Acceleration curve (speed → accel table), soft top speed, strong brakes,
  reverse, rolling + quadratic air drag.
- **Drift**: hold Space/Shift while steering above 43 km/h. Grip drops, the car
  rotates into the slide (steer into it to tighten, counter-steer to widen),
  and a **boost meter** charges with slip angle. Releasing drift converts the
  meter into up to 1.4 s of boost (+30 m/s², cap 259 km/h). Tiny drifts
  (< 20 % meter) give nothing; grip blends back over 0.3 s so exits don't snap.
- Momentum: velocity follows road curvature without losing speed (loops,
  dips), landings absorb only the into-road component, heavy landings raise a
  `land` event. Air: steering yaws, the nose gently follows the flight path;
  the chassis eases parallel to the road just before touchdown.
- **Loops**: loop triangles are tagged `GUIDED` with the road direction, so the
  car follows the loop's sideways lane-shift without steering. Too slow and
  the car peels off at the top.
- Walls (3 body spheres): push-out, low restitution, scrape friction, nose
  swings parallel to the wall. Body spheres stop the roof sinking into the
  road and flag `flipped` for auto-respawn. Continuous ray stops tunnelling.
- Surfaces: `ice` (14 % grip, weaker brakes) and `boost` pads.
- `scripts/physics-report.mjs` prints handling numbers for the current tuning.

**Current feel numbers**: 0–100 km/h 1.6 s, 0–200 km/h 5.7 s, top speed
211 km/h (259 boosted), 200→0 braking 1.3 s / 36 m, grip-turn radius 11 m at
54 km/h and 33 m at 162 km/h, a 1.5 s drift at 144 km/h reaches ~37° slip and
88 % meter.

**Verified** — `tests/phase2-physics.test.js` (13 tests): drift slides + charges
+ boosts, boost exceeds top speed then bleeds off, no drift below min speed,
drifting keeps > 100 km/h through a 180°; kicker jump flies and lands; loop
completed upside-down at speed, peel-off when slow, no steering needed when
entered at an angle; walls stop and scrape; ice slip > 3× road; boost pad fires
once; no tunnelling at 150 m/s; roof-landing detection.
`scripts/verify-phase2.mjs` repeats the jump → drift → boost chain in the
browser playground.

**Trade-offs / notes**
- Holding throttle does *not* pitch the car in the air (first attempt did, and
  the car nose-dived onto its roof). Manual pitch exists behind
  `air.pitchControl` if you want PolyTrack-style air control.
- Loop guidance is an arcade assist. Turn it down with
  `ground.guideCentering`, or remove `guided` from the loop piece if you want
  loops to need steering.

**Needs your input:** PolyTrack's exact numbers aren't published, so this tune
is my best guess at its feel (quick launch, strong brakes, momentum through
jumps). Try it in the browser and tell me what feels off. The usual knobs are
`engine.accelCurve`, `steering.maxYawRate`, `drift.grip` and `drift.yawBase`.

## Phase 3 — Visual style pipeline

**Built** (`src/rendering/`)
- `shaders.js` / `materials.js`: one custom toon `ShaderMaterial` family.
  Half-Lambert lighting is quantised into **3 flat bands** (lit / mid / shadow)
  with themeable tints. **Halftone** is computed in the same fragment shader:
  a 45° screen-space dot grid whose dot radius grows as light falls off, so
  shadows print like comic-book dots. It's pure ALU with no texture fetch and
  no extra pass. There's an optional flat specular + rim "shine" for the car
  paint and glass. Global uniforms (light, fog, ink, pixel scale) are shared
  objects, so theme changes are free.
- `outline.js`: **inverted-hull ink outlines** extruded along averaged
  "outline normals" by a constant number of *screen pixels* (thinning past
  45 m). Every static mesh carries an `outlineNormal` attribute, so hard-edged
  boxes and extrusions get closed hulls.
- `Sky.js`: poster background. A gradient dome with a halftone horizon band
  and an inked, halftone-glow sun, plus concentric cylinders with canvas-
  painted silhouettes (city skylines with lit windows, mountains with snow
  caps, jungle canopy + temples, drifting clouds). About 4 unlit draw calls.
- `textures.js`: all textures are drawn on canvases at load (hand-wobbled
  brush strokes, hatching, edge lines): road atlases per theme (asphalt,
  stone slabs, packed snow, ice, boost chevrons), comic smoke puff, spark
  starburst, halftone contact shadow. No image assets to download.
- `SpeedLines.js`: ink streaks built directly in clip space. One draw call,
  ~110 triangles, covering only the screen border. Intensity follows speed,
  drift and boost.
- `CarModel.js` / `CarView.js`: procedural wedge racer (~1.2k tris) with
  cabin, wing, stripes, lights, spinning/steering wheels, suspension droop,
  body roll and pitch, **squash-and-stretch on landings**, halftone contact
  shadow, ink **skid marks** (tapered ribbon ring-buffer), comic smoke puffs,
  drift sparks coloured by boost tier (blue → orange → pink), boost exhaust.
- `GeoBuilder` merges primitives into single meshes, and `sweepRoadGeometry`
  sweeps a closed road profile (surface, walls, striped curbs, slab) along the
  same path frames used for collision.

**Verified**: `scripts/verify-phase3.mjs` screenshots (idle, speed, jump,
drift, boost) show 3-band shading, dot shading on shadow sides, bold
silhouettes, poster skyline and speed lines. Scene cost: **~30 draw calls,
~13–20k triangles**, no post-processing, no render targets, native MSAA.

**Decision: inverted hull, not Sobel edge detection.** Edge detection needs a
depth+normal pre-pass (about 2× draw calls) plus a full-screen 9-tap filter
at native resolution. That is exactly the fill-rate and bandwidth that
tile-based phone GPUs are short of, and it forces an offscreen target (no
cheap MSAA). The hull adds one flat-shaded draw per mesh and keeps MSAA. Cost:
no interior crease lines, so road edges, curbs and panel lines are painted
into geometry/textures instead.

**Framerate note**: this container only has software WebGL (SwiftShader), so
absolute fps here (15–30) says nothing about a phone GPU. The budget is what
matters: ~30 draws, < 25k tris, one pass. Real-device-class profiling
(CPU-throttled) is part of Phase 9.

**Colour management** is disabled on purpose: comic colours are authored as
sRGB hex and shaded with flat multipliers in display space, so a "#ff4d5a"
wall top is exactly that colour on screen.

## Phase 4 — Track pieces, Rooftop Run, checkpoints

**Built**
- `src/tracks/pieces.js`: 13 modular prefabs on a 10 m grid with 2.5 m
  height levels: straight, tight turn, wide curve, banked curve, slope, long
  slope, jump ramp, loop (left/right lane-shift), boost pad, checkpoint, start,
  finish. Each prefab declares footprint cells, height, connectors and
  centre-line path segments. Pieces are undirected (a slope can be driven up
  or down, a curve left or right), which is what lets the same prefabs work
  in the editor. Any piece can take an `ice` surface.
- `TrackBuilder.js`: placements → collision, chunked render geometry
  (160 m chunks per material), a dense **racing line** from traversing
  connectors (jump gaps are found by a look-ahead search), ordered checkpoint
  gates, spawn, kill height and validation errors. Runs headless.
- `Turtle.js`: tracks are authored as driving scripts
  (`['bankRight'], ['ramp'], ['gap', 3, -2], ['loopLeft']…`) in
  `src/tracks/data/*.js`. The turtle rejects overlapping layouts.
- **Rooftop Run** (`data/rooftop-run.js`): 94 pieces, 1.2 km, 5 checkpoints.
  Boost start, climb and leap across a street gap, banked plunge into a drift
  chicane, a loop over the avenue, a second hop, a rolling hill run, and a
  final jump to a boosted finish. Rooftop decor (`decor.js`): every track
  cell sits on its own building, plus surrounding blocks with window
  facades, parapets, chimneys, AC units, antennas, water towers, neon signs
  and billboards (hand-lettered, canvas-drawn) and the street far below.
  Gates have lettered START / CHECKPOINT / FINISH banners.
- `Race.js`: countdown (3-2-1-GO), sequential checkpoints with split times,
  **tick-accurate timer interpolated to the sub-tick crossing**, respawn at
  the last checkpoint (keeping entry speed) after 0.9 s on falls, flips or
  missed checkpoints, `R` = instant reset, `Enter` = restart. Finishing
  requires every checkpoint in order.
- `RaceSession.js` + `HUD.js` + `Impact.js`: comic HUD (mm:ss.mmm clock,
  CP n/N, speedometer, tiered drift-boost meter, split delta) and starburst
  impact bubbles (3/2/1/GO!, CHECK!, ZOOM!, VROOM!, SPLAT!, BONK!, WHAM!).
- `Autopilot.js`: pure-pursuit driver with curvature-aware braking, used for
  tests, verification and (Phase 9) the menu attract mode.

**Verified**
- `tests/phase4-tracks.test.js` (9 tests): every prefab builds; connector
  ends are continuous with the route for every piece type; rotations; jumps
  bridged; overlap rejection; **a full timed lap of Rooftop Run completes with
  0 respawns** and checkpoints in order; countdown freezes the car; fall →
  respawn at last checkpoint with the clock running; skipping a checkpoint →
  "missed" + respawn; early finish crossing doesn't count.
- Browser: `scripts/verify-phase4.mjs` drives the full lap with the
  autopilot. It finished in **36.237 s**, identical to the headless run (the
  simulation is deterministic). `scripts/shoot-at.mjs` freezes exact race
  times for screenshots (loop, jumps, gates).

**Issues found & fixed during verification**
- `loopRight` double-negated its lane shift; the loop veered away from its
  own exit (caught by the headless lap).
- Hard side-hits could vault the 1 m visual wall. Collision barriers are now
  2.4 m tall (invisible above the visible wall).
- The offset chase camera clipped outside the loop at the top (black
  screen). The camera now rides the car's own trail and pulls in when track
  geometry blocks the view. This also shows drift angle nicely.
- The first draft of the track was 14 s long, so I extended it to 1.2 km
  (~36 s for the autopilot; a human should land around 35–45 s).

**Budget**: Rooftop Run is ~74k render triangles in total (≈10k road, 47k
decor, 16k facades) and 41 chunk meshes. A typical frame draws 50–70 calls
and 70–110k triangles including outlines. Revisited in the Phase 9
performance pass.

## Phase 5 — Ghost replay + leaderboard

**Built**
- `replay/Recorder.js`: position + orientation + state flags every 4 ticks
  (30 Hz). Sample *k* is exactly race tick 4·*k*, so playback is frame-rate
  independent. `replay/codec.js` stores samples as base64 Float32 (a 36 s lap
  is about 47 KB in localStorage).
- `replay/GhostPlayer.js`: Catmull-Rom positions and slerped rotations,
  never interpolating across respawn teleports. The ghost is a translucent
  blue ink-outlined car with spinning wheels. It fades when it overlaps the
  player and waits at the finish line.
- `storage/storage.js` (namespaced, try/catch everywhere, memory fallback),
  `storage/records.js` (top-10 times per track, ghost save/load),
  `storage/settings.js`. Record keys include a **hash of the track layout**,
  so edited tracks never compare times across layouts.
- Menus (`ui/Menus.js`): title with bursting logo, track select cards (PB +
  ghost badge), records table per track, settings, pause, results ("NEW
  RECORD!" / "FIRST TIME!" / "FINISH!", delta vs best, rank, top-5 table,
  RETRY / NEXT TRACK / TIMES / MENU). Keyboard: arrows move focus, Enter
  activates, Esc goes back or pauses. The autopilot laps the tracks behind
  the menus (attract mode).
- HUD shows the best time and flashes the split delta at every checkpoint
  against the best run's splits.

**Verified**
- `tests/phase5-replay.test.js` (8 tests): 30 Hz coverage of a full lap;
  codec round-trip; playback matches the recorded path at every sample (<1 mm)
  and ends at the finish; ghost size budget; stable layout keys that change
  on edit; top-10 ordering, ranks, new-best detection; ghost save/load and
  no crash when the storage quota is full.
- Browser (`scripts/verify-phase5.mjs`): lap 1 → 36.237 s, rank 1, ghost
  saved. Lap 2 with a slower driver → ghost loaded and visible, delta shown
  at CP1, finish 37.139 s → rank 2, previous best 36.237.
- **Bug caught:** the results panel showed `--:--.---` / "+NaN" because the
  stored result had no `time` field. Fixed.

## Phase 6 — Ruin Rally + Frost Peak

**Built**
- **Ruin Rally** (`data/ruin-rally.js`): 109 pieces, 1.36 km, 6 checkpoints.
  Temple stairs up and down, a leap across the ravine, a courtyard
  switchback, the Serpent Loop, a mossy hump that launches you over a gate at
  speed, and a long banked sweep home. Decor: stone causeway pillars with
  capitals and hanging vines, a faceted low-poly jungle canopy, broken
  columns, arches, stone heads facing the track, braziers, distant stepped
  pyramids, a mist-green floor, plus a jungle/temple poster sky.
- **Frost Peak** (`data/frost-peak.js`): 96 pieces, 1.25 km, 5 checkpoints,
  **16 ice pieces** (ice shelf, icy loop approach, frozen waterfall).
  Switchback climbs, the Avalanche Jump (4 cells, 4 levels down), an ice
  loop, and a long descent to the lodge. Decor: snow-capped rock ledges with
  strata facades, pines, rocks, ice crystals, the odd snowman, and snowy
  mountain posters.
- Each theme has its own road atlas (asphalt / stone slabs / packed snow +
  ice), facade texture, wall palette, fog, light tint and poster sky.
- The autopilot is ice-aware (corners on ice at 22 % lateral grip).

**Verified** — `tests/phase6-tracks.test.js` (10 tests): all 3 tracks have
straights, banked curves, a jump, a loop and ≥ 4 checkpoints, are > 1 km,
stay under 130k render triangles, and **are completed by the autopilot with
0 respawns** (Rooftop 36.2 s, Ruins 38.7 s, Frost 37.1 s). Themes are
distinct in road style, sky and palette. Browser screenshots of each.

**Issues found & fixed**
- Crest physics: the car flies off slope tops at speed (like PolyTrack), so
  a curve right after a climb was unmakeable. I redesigned Frost Peak with
  landing room after every climb.
- Flying high over a checkpoint after a crest didn't count (trigger was 8 m
  tall). Triggers are now 25 m tall.
- Frost decor started at 316k triangles. Low-poly open cones/trunks, fewer
  props per cell and no small props beyond 4 cells brought it to 109k
  (Ruins 87k, Rooftop 59k).

## Phase 7 — Track editor

**Built** (`src/editor/`)
- `Editor.js`: editor mode. Grid placement at a chosen height level, rotate,
  erase, ice paint, undo/redo (200 steps), theme and name. **Auto-snap**:
  hover next to an open road end and the selected piece rotates and lifts
  itself to connect (slopes snap to the right level), so building on a phone
  is mostly tap-tap-tap. `R` or the ROTATE button overrides until you move
  on. Camera: drag to pan, right-drag to orbit, wheel to zoom, WASD/Q/E, and
  on touch one-finger pan, pinch zoom and two-finger twist.
- `placement.js`: the pure snap/overlap/erase rules (unit-tested).
- `EditorView.js`: pieces are rendered as **InstancedMeshes** (one per piece
  type × surface × material, with ink outlines), so a 200-piece track stays
  at a few dozen draw calls and edits are instant. Also draws the level
  grid, cursor cell, green/red placement preview and red erase highlight.
- `EditorUI.js` + `pieceIcons.js`: comic toolbar (MENU, name, theme, undo,
  redo, SAVE, LOAD, EXPORT, IMPORT, NEW, ▶ TEST DRIVE), a palette with inked
  SVG icons, and a tool column (ERASE / ROTATE / level ▲▼ / ICE / SNAP). The
  status line shows START ✓, FINISH connected ✓ and CP counts. Floating S /
  1…n / F labels show the driving order. The LOAD dialog lists saved tracks
  and lets you copy a built-in track as a "Remix" template.
- Persistence (`storage/customTracks.js`): localStorage save/list/delete, a
  continuously saved **draft**, and a shareable JSON format
  (`{ format: "inktrack-track", version: 1, name, theme, pieces }`) with
  strict validation on import (known pieces, integer grid values, size cap,
  sanitised names).
- **Test drive** suspends the editor (history intact), races the track with
  ghost + leaderboard, and returns via pause → BACK TO EDITOR or the
  results screen's EDITOR button. Saved tracks appear in RACE → YOUR TRACKS.

**Verified**
- `tests/phase7-editor.test.js` (8 tests): local geometry for every piece;
  auto-snapped chains form a connected track the autopilot can finish; slope
  level snapping; overlap blocking (and bridges above); open ends and erase
  picking; save/list/reload/rename/delete; export → import round-trip; and
  rejection of bad or hostile files.
- Browser (`scripts/verify-phase7.mjs`): 18 pieces placed with **real
  palette and canvas clicks** (including a jump), named and saved, page
  reloaded, re-opened from LOAD (19 pieces intact), exported (a
  `Verify-Loop.inktrack.json` download) and re-imported, test-driven to the
  finish (8.07 s, 0 respawns), back in the editor with undo history, and
  listed in the track select screen.

## Phase 8 — Mobile support

**Built**
- `input/Touch.js`: on-screen controls, shown automatically on touch
  devices (or with `?touch=1`) during races only. Left thumb: a two-zone
  steering pad. Right thumb: big GAS, BRAKE and DRIFT. Every finger is
  hit-tested on each move, so you can **slide between ◀/▶ or GAS/BRAKE
  without lifting**. Controls respond on `pointerdown` (no click delay), and
  `touch-action: none` blocks scrolling and zooming. Plus ↺ reset and ❚❚
  pause buttons.
- **Tilt steering** (Settings → Touch steering → Tilt): DeviceOrientation
  with an auto-calibrated neutral pose, dead zone and portrait/landscape
  axis mapping. It requests iOS 13+ motion permission from that settings
  gesture, and a tap re-centres it. **Auto-accelerate** option.
- Responsive layouts: the HUD reflows around the thumbs (speed/meter under
  the timer in portrait, bottom-centre in landscape), portrait stacks
  BRAKE above GAS with DRIFT beside it, controls size with
  `min(vw, vh, px)` and respect safe-area insets, menus scroll on short
  screens, the editor toolbar collapses file actions into FILE ▾, and
  panels shrink on narrow screens.
- Canvas/renderer: resize on window, orientation and visualViewport
  changes; portrait keeps a sensible horizontal FOV; touch devices default
  to the Medium preset (pixel ratio ≤ 1.5).
- Editor touch: tap to place, one-finger pan, pinch zoom, two-finger twist.

**Verified** (`scripts/verify-phase8.mjs`, emulated phone with real
multi-touch via CDP, portrait 390×844 and landscape 844×390):
- Menus navigated by tapping. No page overflow either way.
- **Input latency: GAS is live synchronously inside the `touchstart`
  handler**, so the next 120 Hz physics tick (≤ 8.3 ms) sees it.
- Hold GAS → accelerates. Hold GAS + ▶ → turns right. Sliding the same
  finger to ◀ → steer −1, turns left. GAS + ◀ + DRIFT → drifting
  (landscape run). ❚❚ pauses.
- Tilt: enabled through the real Settings UI; ±12° from neutral → steer
  ±0.49, steering pad hidden.
- Rotating mid-race resizes the canvas to landscape (1266×585 @1.5×).
- Editor: palette tap + canvas tap places a piece; pinch zooms 95 → 28 m;
  drag pans.

**Bug caught:** the first canvas tap in the editor after switching theme
landed during a one-off shader/texture stall, and the tap timer (measured
with `performance.now()`) saw 914 ms and treated it as a long-press. Taps now
use the events' own input timestamps.

**Note:** real-device testing (actual iOS/Android GPUs and gyros) isn't
possible from this container. Everything above ran in Chromium's mobile
emulation, and tilt was checked with synthetic orientation events.

## Phase 9 — Polish pass

**Comic HUD & impact effects**
- HUD: ink-bordered panels with offset shadows, Bangers lettering, the timer
  in an inverted black panel, a tiered drift meter (blue/orange/pink, striped
  while boosting) and split-delta tags.
- Starburst impact bubbles: 3-2-1-GO!, CHECK! n/N, DRIFT! (when a slide
  reaches tier 2), VRM!/VROOM!/VROOOM! by boost size, ZOOM! (pads), AIR!,
  WHAM!/THUD! (big landings), BONK!/CRUNCH! (walls), SPLAT!/WHOOPS! (falls),
  KRASH! (flips), MISSED!, FINISH!, NEW RECORD!. There is also an inked
  yellow/orange edge pulse while boosting.
- Optional FPS meter (Settings or `?fps`): fps, draw calls, triangles,
  render scale.

**Sound** (`src/audio/Sfx.js`, all synthesized with Web Audio, so there
are no files and no licensing): an engine with a fake gearbox (pitch climbs,
drops on each shift, brighter under throttle and boost), tyre squeal from
slip/drift/hard braking (pitched lower on ice), speed-dependent wind, a boost
whoosh, a pitch-rising VROOM for drift boosts, a checkpoint arpeggio (plus an
"ahead" chirp when beating your split), countdown beeps, a finish fanfare and
record jingle, wall crunches, landing thumps, a fall slide-whistle, and UI
clicks / place pop / erase swish / error buzz. The context unlocks on the
first key or tap, the volume slider is live, and the engine bed mutes on
pause/menus. Verified running in the browser (`scripts/verify-audio.mjs`).

**Performance pass** (`scripts/perf.mjs`: mobile viewport, 4× CPU
throttling, profiled after warm-up)

| | before | after |
|---|---|---|
| Car draw calls (player + ghost) | ~18 + ~18 | 5 + 5 (merged body, instanced wheels) |
| Rooftop Run frame draw calls | ~50 | ~36–40 |
| Physics per 120 Hz tick (4× throttled) | 0.14–0.26 ms | 0.13–0.18 ms |
| Scene update per frame (4× throttled) | 0.8 ms | 0.5–0.8 ms |
| Render submit p95 (4× throttled) | ~6 ms | ~5.6–7.7 ms |

At 4× CPU throttle, main-thread work for a 60 fps frame (2 physics ticks,
scene update, render submission) is about 7–9 ms at p95, well inside the
16.7 ms budget. Changes:
- Car: body, cabin, trim and stripes merged into one vertex-coloured mesh;
  the four wheels are a single InstancedMesh (hulls included).
- Outline LOD: track-chunk hulls more than 300 m away are skipped (they're
  thin and fogged there anyway).
- **Dynamic resolution governor** for "Auto" quality: every 4 s it drops
  the render scale by 0.1 (to a 0.6 floor) when fps < 48 and restores it
  after sustained > 58 fps. The window is long because each change
  reallocates the drawing buffer.
- Collision callbacks bound once (no per-tick closure allocations). The
  simulation stays bit-identical: Rooftop Run's autopilot lap is still
  36.237 s.

**Heaviest case:** Frost Peak's open mountain views draw ~80 calls and ~150k
triangles including outlines. That's comfortable for 2022 mid-range GPUs
(Adreno 64x / Mali-G78 class), but it's the first place to trim if a device
struggles (lower `quality` or reduce the decor radius in `decor.js`).

**Caveat:** this container only has software WebGL (SwiftShader), so GPU
timings here are meaningless. The numbers above are main-thread CPU costs
under throttling. **Please try it on a real phone.** The FPS meter
(`?fps`) shows draw calls, triangles and render scale on-device.

**Bug caught in the final pass:** Phase 8's FILE ▾ dropdown reused the
`.ed-file` class, so the editor grabbed the dropdown instead of the hidden
file input and IMPORT stopped working. The re-run of the full editor
verification caught it; fixed.

---

## Update — sea & sky, shortcuts, garage and progression

Feedback: the engine hum was annoying, add real music, more and longer
maps, hidden shortcuts, ocean/air modes with their own vehicles, vehicle
customisation, and more reasons to keep playing.

**Audio.** The engine used a sawtooth + square pair through a resonant
filter (Q 3), so it droned. It is now a triangle + sine through a gentle
low-pass (Q 0.6) with a slow 5.5 Hz wobble. It sits on its own bus with an
*Engine sound* slider (default 30 %), so it peaks around a quarter of its old
level. Boats and planes get their own pitch and filter ranges.
Music is a small Web Audio sequencer (`src/audio/Music.js`) that plays seven
arrangements from `songs.js`: a menu song, one per theme, and ocean/sky
songs. Each has drums with kick side-chain "pump", bass, chords, arpeggios
and a lead, plus a dotted-8th echo and a generated reverb. Songs cycle
through their sections and drop into a breakdown every third pass. Music
muffles under the pause menu and has its own slider and on/off toggle.
**Real recordings:** drop `menu.mp3`, `rooftop.ogg` etc. into `assets/music/`
and they replace the synthesized song with the same name. No licensed audio
ships with the repo.

**Shortcuts.** New `fork` / `forkRight` pieces are 2×3 plazas with three
connectors: the entry, the main lane and a side lane. Driven backwards the
same piece is a merge. Side-lane segments are tagged `lane`, so they render
and collide but stay off the racing line. The turtle's
`['shortcut', side, { main, alt }]` places the fork, runs both
sub-scripts and then finds the merge rotation that joins them; it throws if
the lanes don't meet. Pieces on a side lane carry `sc: id`. The race fires
a `shortcut` event the first time the car is over one of their cells, and
discoveries are saved. The traversal rule ("exit by the other connector")
already did the right thing for three-connector pieces.
*Bug caught:* `reversePath` flips a segment's left/right, but the wall flags
weren't swapped. Every earlier piece had symmetric walls, so it only
surfaced on the first reversed merge, where the car fell straight through
the open side.

**Tracks.** There are six. Rooftop Run gains an alley-hop shortcut and a
tower-drop finale (1.2 → 1.5 km, par 50.4 s). Ruin Rally gains an aqueduct
jump and a sunken-plaza section (1.7 km, par 48.4 s). Frost Peak gains a
frozen-creek ice lane and a lodge loop (1.7 km, par 51.4 s). New:
- *Canyon Blitz*: Red Canyon theme, two shortcuts, par 46.4 s.
- *Tidal Run*: speedboat, par 38.5 s.
- *Cloud Circuit*: plane, 2.6 km, par 50.5 s.

`scripts/par-times.mjs` regenerates the par times (clean autopilot laps).

**Ocean mode.** The track pipeline is unchanged; the Tropic Bay theme does
the work:
- The lanes use an animated water "road" texture. A new `uMapOffset`
  uniform scrolls it along the direction of travel.
- A tiled sea plane sits just below lane level, so low lanes read as
  buoyed channels and raised ones as flumes on stilts.
- The boat is `CarPhysics` with a looser profile (`vehicles/profiles.js`):
  lateral grip 4.2 instead of 12, easier drifts and bouncier barriers.
  Visually it bobs, planes its nose up and throws a foam wake.

**Air mode.** `FlightPhysics` has the same public surface as `CarPhysics`:
- The plane always flies forward. Up/down pitch it, steering banks and
  turns, and drift is a hard bank that charges the same boost meter.
- Dives add speed and climbs bleed it off.
- Sky layouts are ordinary piece layouts that are never rendered. The
  route is scaled ×2.5 so turns suit a plane's turning circle.
- Checkpoints become rings, boost pads become boost hoops, and guide hoops
  mark the path.
- Floating islands, balloons and rocks are sphere obstacles. Hitting one,
  falling below the course, or straying more than 55 m from it triggers a
  respawn.
- `FlightAutopilot` flies it for attract mode, tests and the rival.

**Garage.** Vehicles are rebuilt from a *look*, cached per look:
- Bodies: racer / muscle / buggy cars, speedboat / hydroplane boats and
  prop / jet planes.
- Paint, accent colour, decals (stripes, race number, flames, checkers,
  stars), spoilers, rims and boost-trail colour.

Items cost ink. Looks never change handling, so times stay comparable.
The garage menu sits over a turntable showroom.

**Progression and variety:**
- **Ink pots**: 9–20 per track along the racing line, including over jump
  gaps, plus one on every shortcut lane. Pots found on earlier runs show
  faded.
- **Medals** from par: bronze ×1.35, silver ×1.15, gold ×1.04, and an *ink
  medal* at ×0.97. The ink medal means beating the bot, which usually
  takes the shortcuts. The HUD shows the next medal to chase.
- **Inkbot rival** (easy/medium/hard): the autopilot races alongside as a
  pink ghost with no collisions, stepped in lockstep with your race.
- **Twists** (mutators): Moon Jump, Turbo, Butter Tyres, Mini, Night Ink.
  They are just for fun, so records and ghosts are skipped.
- **Daily challenge**: a date-seeded track + twist + goal (pots, beat the
  bot, or no respawns), worth +25 ink once.
- Ink economy: pot 5, shortcut 10, medals 5/10/20/40, daily 25.

**Testing.** `npm test` runs 81 tests, including every starter track
completing with zero respawns under its autopilot. Browser checks: the
existing `npm run verify` suite, the audio check, plane keyboard controls,
rival + twists, and portrait/landscape menus.

---

## Things that need your input

1. **Handling feel vs. PolyTrack.** The tune is an educated guess. Drive it
   and tell me what feels off. `npm run physics-report` prints the current
   numbers, and `INKTRACK.physics` can be edited live in the console.
2. **Loop assist.** Loops auto-steer the car along the lane-shift. Keep it,
   or make loops require steering (`ground.guideCentering` / the `guided`
   flag on the loop piece)?
3. **Air control.** Throttle does not pitch the car in the air, because holding
   gas made it nose-dive. PolyTrack-style manual air pitch exists behind
   `air.pitchControl`.
4. **Countdown.** Races use a 1.5 s 3-2-1 countdown. PolyTrack starts the
   clock on the first input instead; I can switch to that if you prefer.
5. **Real-device testing.** Everything was verified in Chromium (desktop +
   mobile emulation with real multi-touch). Please check on an actual phone,
   especially tilt steering on iOS (permission prompt) and GPU frame rate.
6. **Music.** The soundtrack is synthesized so it ships license-free. If you
   have tracks you'd rather use, drop them into `assets/music/` with the
   song ids as file names (`menu`, `rooftop`, `ruins`, `frost`, `canyon`,
   `ocean`, `sky`).
7. **Ink prices and medal thresholds.** They're a first pass
   (`src/vehicles/garage.js`, `src/storage/progress.js`). Tell me if unlocks
   come too fast or too slow.
