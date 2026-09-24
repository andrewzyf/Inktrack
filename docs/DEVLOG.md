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
