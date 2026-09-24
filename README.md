# InkTrack

**A hand-inked, comic-book arcade racer for desktop and mobile browsers.**
Drift, boost, loop and leap across six tracks on land, sea and sky, in a car,
a speedboat or a plane. Find hidden shortcuts, collect ink pots, win medals,
race the Inkbot and your own ghost, customize your rides in the garage, and
build your own tracks in the editor. Everything runs client-side, with no
server and no downloads beyond the game itself.

| | |
|---|---|
| ![Title](docs/images/title.jpg) | ![Pick a track](docs/images/tracks.jpg) |
| ![Rooftop Run](docs/images/rooftop-run.jpg) | ![Canyon Blitz](docs/images/canyon-blitz.jpg) |
| ![Tidal Run — speedboat](docs/images/tidal-run.jpg) | ![Cloud Circuit — plane](docs/images/cloud-circuit.jpg) |
| ![Garage](docs/images/garage.jpg) | ![Night Ink twist vs the Inkbot](docs/images/night-rival.jpg) |
| ![Ruin Rally](docs/images/ruin-rally.jpg) | ![Frost Peak](docs/images/frost-peak.jpg) |
| ![Inside the loop](docs/images/loop.jpg) | ![Track editor](docs/images/editor.jpg) |

<p align="center"><img src="docs/images/mobile.jpg" width="260" alt="Mobile portrait layout"></p>

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (relative paths — host anywhere)
npm run preview    # serve the production build on :4173
```

### Controls

| | Desktop | Touch |
|---|---|---|
| Accelerate (plane: climb) | `W` / `↑` | **GAS** / **UP** (or *Auto-accelerate* in Settings) |
| Brake / reverse (plane: dive) | `S` / `↓` | **BRAKE** / **DOWN** |
| Steer | `A` `D` / `←` `→` | ◀ ▶ zones (slide between them), or *Tilt* in Settings |
| Drift (plane: hard bank) | `Space` / `Shift` (hold while turning) | **DRIFT** / **BANK** |
| Reset to last checkpoint | `R` | ↺ |
| Restart | `Enter` | pause → RESTART |
| Pause | `Esc` / `P` | ❚❚ |

**Drift boost:** hold drift while turning above ~43 km/h. The slide charges a three-tier
meter (blue → orange → pink); let go for a boost of up to 1.4 s. Boats slide more, and
planes charge the same meter with a hard bank.

**Planes** always fly forward: climb and dive with up/down, dive to gain speed, fly
through the yellow rings (checkpoints) and orange hoops (boost), and don't hit the
floating islands. The route has no road, so cut corners wherever you dare.

**Editor:** click/tap to place · drag to pan · right-drag or two-finger twist to orbit ·
wheel/pinch to zoom · `R` rotate · `+`/`−` level · `X` erase · `I` ice · `G` snap ·
`T` test drive · `Ctrl+Z`/`Ctrl+Y` undo/redo · `Ctrl+S` save.

## Features

- **Three modes, six tracks.** On land: *Rooftop Run*, *Ruin Rally*, *Frost Peak* and
  *Canyon Blitz*. At sea, a speedboat through the water flumes of *Tidal Run*. In the
  sky, a stunt plane through the rings of *Cloud Circuit*.
- **Hidden shortcuts.** Fork pieces split off side lanes: an alley hop, an old temple
  aqueduct, a frozen creek, a dry riverbed, a mine rail and a lagoon. Found shortcuts
  are saved on the track card.
- **Ink pots, medals and the garage.**
  - Collect ink pots, discover shortcuts and beat the bronze/silver/gold/*ink* medal
    times (the ink medal means beating the bot's par) to earn ink.
  - Spend ink in the **garage**: 3 car bodies, 2 boats and 2 planes, plus paint, accent,
    decals, spoilers, rims and boost trails. Looks only, so times stay fair.
- **Inkbot rival, twists and a daily challenge.**
  - Race a live autopilot rival (easy/medium/hard).
  - Add *twists*: Moon Jump, Turbo, Butter Tyres, Mini, Night Ink.
  - Take on a date-seeded daily challenge for bonus ink.
- **A real soundtrack, a quiet engine.** A Web Audio sequencer plays a song per theme,
  with drums, bass, chords, arps and lead, plus echo and reverb. It has separate music
  and engine sliders, and the engine is a soft hum you can turn down or off. Drop your
  own `menu.mp3`, `rooftop.ogg`, … into `assets/music/` to replace any song.
- **Arcade physics tuned for momentum and drifting.** Loops, banked curves, jump ramps
  and crest launches, forgiving landings, wall scrapes, ice and boost pads. Every feel
  constant lives in [`src/config/physics.js`](src/config/physics.js).
- **Comic rendering in a single pass.** Three-band cel shading, screen-space halftone dots
  in the shadows, inverted-hull ink outlines at a constant pixel width, poster-style
  skylines, speed lines, ink skid marks, smoke puffs and drift sparks, plus
  squash-and-stretch landings.
- **Sequential checkpoints**, a tick-accurate race clock (`mm:ss.mmm`), split deltas,
  and automatic respawn after falls, flips or missed checkpoints.
- **Ghost replay** of your best run on each track, plus a **local top-10 leaderboard**.
- **Track editor** with auto-snap to open road ends, 15 piece types (including fork /
  merge plazas for your own shortcuts), height levels, ice painting, undo/redo,
  save/load, JSON **export/import** and instant **test drive**. Pick the *Tropic Bay*
  theme for a boat track or *Cloud Kingdom* for a plane course.
- **Mobile:** multi-touch controls, optional tilt steering, portrait and landscape
  layouts, and a dynamic-resolution governor.
- **Procedural everything.** Textures, signs, skies and sound effects are generated at
  runtime (canvas + Web Audio). The only asset files are two OFL fonts.

## How it's built

```
src/
  config/     physics.js — every handling constant, documented
  core/       App (mode state machine), GameLoop (fixed 120 Hz sim), seeded RNG
  physics/    CollisionWorld (spatial-hashed triangles), CarPhysics (arcade controller),
              FlightPhysics (arcade plane)
  vehicles/   vehicle + mutator physics profiles, garage catalogue & looks
  rendering/  toon/halftone/outline shaders, Sky posters, car model & view, effects,
              canvas textures, chase camera, TrackView
  tracks/     piece prefabs, path sweeps, TrackBuilder, Turtle scripts, themes, decor,
              data/ (the three starter tracks)
  race/       Race (rules, timer, checkpoints, respawn, pots, shortcuts), RaceSession,
              Autopilot, FlightAutopilot, daily challenge, Playground
  replay/     Recorder, GhostPlayer, base64 codec
  storage/    guarded localStorage, records, progress (ink, medals), settings, custom tracks
  editor/     Editor, EditorView (instanced pieces), EditorUI, placement rules, icons
  input/      keyboard, touch (+ tilt), input merging
  ui/         HUD, comic impact bubbles, menus, CSS
  audio/      Web Audio synth SFX + music sequencer and song book
assets/fonts  Bangers + Comic Neue (SIL OFL)
```

**Custom physics instead of cannon-es.** A general rigid-body solver works against this
feel: loops need the car to stick to arbitrary surfaces, thin pieces tunnel at 250 km/h,
and grip and drift can only be tuned indirectly through friction. InkTrack's car is a
point mass with a kinematically aligned chassis. Four wheel rays hold it at ride height
on smoothly interpolated normals, and forces act in the road plane. It costs about 8 ray
casts and 6 sphere tests per tick.

**Inverted-hull outlines instead of a Sobel pass.** Edge detection needs a depth+normal
pre-pass plus a full-screen filter at native resolution. That fill-rate and bandwidth is
exactly what tile-based phone GPUs lack, and it rules out cheap MSAA. The hull adds one
flat-shaded draw per mesh. Halftone is computed in the same toon fragment shader, so there
is no post-processing at all.

**Tracks are data.** Each piece defines footprint cells, connectors and centre-line path
segments. One sweep produces render geometry, collision (with analytic smooth normals)
and the racing line. Starter tracks are *turtle scripts*:

```js
['start'], ['straight', 2], ['boost'], ['wideRight'], ['up2'], ['ramp'],
['gap', 3, -2], ['bankRight'], ['left'], ['right'], ['loopLeft'], ['cp'],
['shortcut', 'right', { main: [['left'], ['straight', 3], ['right'], ['right'], ['straight', 3], ['left']],
                        alt: [['ramp'], ['gap', 1, 0]] }],
['finish']
```

A theme picks the vehicle: Tropic Bay races boats on animated water lanes, and Cloud
Kingdom turns the same layout into a sky course, scaled ×2.5, with rings instead of
road.

## Testing & tooling

```bash
npm test                       # 81 unit tests (physics, tracks, modes, replay, editor, progress)
npm run sim -- tidal-run       # headless autopilot lap of any starter track
node scripts/par-times.mjs     # regenerate par (medal) times from autopilot laps
npm run physics-report         # handling numbers for the current tuning
node scripts/perf.mjs rooftop-run 4   # main-thread profile under 4x CPU throttle
npm run verify                 # in-browser checks (needs `npm run preview` running)
```

The headless simulation is deterministic: the autopilot's browser lap of Rooftop Run
matches the Node run to the millisecond (50.447 s).

**URL flags:** `?track=<id>` · `?autopilot[=aggression]` · `?editor` · `?playground` ·
`?quality=low|medium|high` · `?touch=1` · `?fps` · `?record` (lets autopilot runs set
records) · `?rival=easy|medium|hard` · `?twist=lowGravity,turbo,slick,tiny,night`. In the console, `INKTRACK.physics` is the live physics config.

See [`docs/DEVLOG.md`](docs/DEVLOG.md) for per-phase notes, trade-offs and the bugs caught
along the way.

## Licenses

Code: MIT. Fonts: [Bangers](assets/fonts/OFL-Bangers.txt) and
[Comic Neue](assets/fonts/OFL-ComicNeue.txt) under the SIL Open Font License 1.1.
Three.js is MIT-licensed.
