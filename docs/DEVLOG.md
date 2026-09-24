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
