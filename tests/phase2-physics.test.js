import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { CarPhysics } from '../src/physics/CarPhysics.js';
import { CollisionWorld, DRIVABLE, WALL, SURFACE } from '../src/physics/CollisionWorld.js';
import { PHYSICS } from '../src/config/physics.js';
import { createPath, linePath, loopPath } from '../src/tracks/paths.js';
import { addRoadCollision } from '../src/tracks/sweep.js';
import { flatWorld, heading } from './helpers.js';

const DT = 1 / PHYSICS.tickRate;
const RH = PHYSICS.car.rideHeight;

function spawn(world, pos = new Vector3(0, RH, 0), speed = 0, quat = new Quaternion()) {
  const car = new CarPhysics(world);
  const vel = new Vector3(0, 0, 1).applyQuaternion(quat).multiplyScalar(speed);
  car.reset(pos, quat, vel);
  return car;
}

function run(car, seconds, controls = {}, each = null) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    car.step(DT, { throttle: 0, brake: 0, steer: 0, drift: false, ...controls });
    if (each && each(car, i) === false) break;
  }
}

function events(car) {
  return car.drainEvents().map((e) => e.type);
}

describe('Phase 2 — drift + boost meter', () => {
  const world = flatWorld(3000);

  it('drifting slides the car, charges the meter, and releases a boost', () => {
    const car = spawn(world, undefined, 35);
    run(car, 0.3, { throttle: 1 });
    const seen = [];
    let maxSlip = 0;
    run(car, 1.6, { throttle: 1, steer: 1, drift: true }, (c) => {
      seen.push(...events(c));
      maxSlip = Math.max(maxSlip, c.slip);
    });
    expect(seen).toContain('driftStart');
    expect(car.drifting).toBe(true);
    expect(maxSlip).toBeGreaterThan(0.25); // visibly sliding sideways
    expect(car.driftMeter).toBeGreaterThan(0.7);
    const meter = car.driftMeter;
    run(car, DT, { throttle: 1 });
    expect(events(car)).toContain('driftBoost');
    expect(car.drifting).toBe(false);
    expect(car.boostTime).toBeCloseTo(PHYSICS.boost.driftDuration * meter, 1);
  });

  it('a drift boost pushes the car beyond its normal top speed', () => {
    const car = spawn(world, undefined, 50);
    run(car, 4, { throttle: 1 }); // settle at top speed
    const cruise = car.speed;
    expect(cruise).toBeLessThanOrEqual(PHYSICS.engine.maxSpeed + 0.01);
    car.boostTime = PHYSICS.boost.driftDuration;
    let peak = 0;
    run(car, PHYSICS.boost.driftDuration, { throttle: 1 }, (c) => { peak = Math.max(peak, c.speed); });
    expect(peak).toBeGreaterThan(cruise + 10);
    run(car, 4, { throttle: 1 });
    expect(car.speed).toBeLessThan(peak - 5); // bleeds back to cruise
  });

  it('no drift below the minimum speed, and no boost for a tiny drift', () => {
    const slow = spawn(world, undefined, 6);
    run(slow, 0.5, { steer: 1, drift: true });
    expect(slow.drifting).toBe(false);

    const car = spawn(world, undefined, 35);
    run(car, 0.1, { throttle: 1, steer: 1, drift: true });
    expect(car.drifting).toBe(true);
    run(car, DT, { throttle: 1 });
    expect(events(car)).toContain('driftEnd');
    expect(car.boostTime).toBe(0);
  });

  it('drifting holds more speed through a 180° turn than braking + gripping would allow at the same rate', () => {
    const car = spawn(world, undefined, 40);
    const h0 = heading(car);
    let t = 0;
    run(car, 4, { throttle: 1, steer: 1, drift: true }, (c) => {
      t += DT;
      let dh = h0 - heading(c);
      if (dh < 0) dh += Math.PI * 2;
      return dh < Math.PI; // stop after turning 180°
    });
    expect(t).toBeLessThan(2.5);
    expect(car.speed).toBeGreaterThan(28);
  });
});

describe('Phase 2 — momentum, jumps and loops', () => {
  it('launches off a kicker ramp, flies, and lands without losing much speed', () => {
    const world = new CollisionWorld();
    const run1 = linePath(new Vector3(0, 0, -200), new Vector3(0, 0, 0));
    addRoadCollision(world, run1, { walls: [false, false], width: 12 });
    // Kicker: y = 2 t², 10 m long → ~22° lip.
    const kicker = createPath((t, o) => o.set(0, 2 * t * t, t * 10));
    addRoadCollision(world, kicker, { walls: [false, false], width: 12, samples: 20 });
    const landing = linePath(new Vector3(0, 0, 40), new Vector3(0, 0, 400));
    addRoadCollision(world, landing, { walls: [false, false], width: 12 });
    world.build();

    const car = spawn(world, new Vector3(0, RH, -60), 40);
    let airborneTicks = 0, maxY = 0;
    const seen = [];
    run(car, 4, { throttle: 1 }, (c) => {
      if (!c.grounded) airborneTicks++;
      maxY = Math.max(maxY, c.position.y);
      seen.push(...events(c));
    });
    expect(airborneTicks * DT).toBeGreaterThan(0.8);
    expect(maxY).toBeGreaterThan(5);
    expect(seen).toContain('land');
    expect(car.grounded).toBe(true);
    expect(car.position.z).toBeGreaterThan(60);
    expect(Math.abs(car.position.x)).toBeLessThan(1);
    expect(car.speed).toBeGreaterThan(40);
  });

  function loopWorld() {
    const world = new CollisionWorld();
    addRoadCollision(world, linePath(new Vector3(0, 0, -150), new Vector3(0, 0, 0)), { walls: [false, false] });
    // Loop shifts one lane to the left (+X) so the exit clears the entry.
    const loop = loopPath(new Vector3(0, 0, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0), 9, 10);
    addRoadCollision(world, loop, { samples: 96, guided: true });
    addRoadCollision(world, linePath(new Vector3(10, 0, 0), new Vector3(10, 0, 200)), { walls: [false, false] });
    return world.build();
  }

  it('completes a vertical loop at speed', () => {
    const world = loopWorld();
    const car = spawn(world, new Vector3(0, RH, -40), 38);
    let maxY = 0, invertedTicks = 0;
    run(car, 5, { throttle: 1 }, (c) => {
      maxY = Math.max(maxY, c.position.y);
      if (c.getUp(new Vector3()).y < -0.8) invertedTicks++;
      return c.position.z < 60;
    });
    expect(maxY).toBeGreaterThan(16); // went over the top
    expect(invertedTicks).toBeGreaterThan(10); // drove upside-down
    expect(car.grounded).toBe(true);
    expect(car.position.x).toBeGreaterThan(8); // came out in the exit lane
    expect(car.position.z).toBeGreaterThan(20);
    expect(car.speed).toBeGreaterThan(30);
  });

  it('peels off the loop when too slow to make the top', () => {
    const world = loopWorld();
    const car = spawn(world, new Vector3(0, RH, -12), 27);
    let fell = false, maxY = 0;
    run(car, 4, {}, (c) => {
      maxY = Math.max(maxY, c.position.y);
      if (!c.grounded && c.getUp(new Vector3()).y < 0.3 && c.position.y > 6) fell = true;
    });
    expect(fell).toBe(true);
    expect(maxY).toBeLessThan(17.5);
  });

  it('loops need no steering even when entered at a slight angle', () => {
    const world = loopWorld();
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.05);
    const car = spawn(world, new Vector3(0, RH, -8), 40, q);
    const seen = [];
    run(car, 3, { throttle: 1 }, (c) => { seen.push(...events(c)); return c.position.z < 40; });
    expect(seen).not.toContain('wall');
    expect(car.position.x).toBeGreaterThan(7);
    expect(car.position.x).toBeLessThan(13);
    expect(Math.abs(heading(car))).toBeLessThan(0.08);
  });
});

describe('Phase 2 — collisions and surfaces', () => {
  it('walls stop the car and it scrapes along instead of passing through', () => {
    const world = new CollisionWorld();
    addRoadCollision(world, linePath(new Vector3(0, 0, -50), new Vector3(0, 0, 400)), { width: 10, wallHeight: 1.2 });
    world.build();
    // Aim 20° toward the left wall (+X) at 45 m/s.
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.35);
    const car = spawn(world, new Vector3(0, RH, 0), 45, q);
    const seen = [];
    let maxX = 0;
    run(car, 2, { throttle: 1 }, (c) => {
      seen.push(...events(c));
      maxX = Math.max(maxX, c.position.x);
    });
    expect(seen).toContain('wall');
    expect(maxX).toBeLessThan(5); // never through the wall at x = 5
    expect(Math.abs(heading(car))).toBeLessThan(0.2); // nose swung along the wall
    expect(car.speed).toBeGreaterThan(25); // scraped, not stopped dead
  });

  it('ice has much less lateral grip', () => {
    const make = (surface) => {
      const w = new CollisionWorld();
      addRoadCollision(w, linePath(new Vector3(0, 0, -50), new Vector3(0, 0, 600)), { width: 200, walls: [false, false], surface });
      return w.build();
    };
    const slipOn = (surface) => {
      const car = spawn(make(surface), undefined, 35);
      let maxSlip = 0;
      run(car, 1, { throttle: 1, steer: 1 }, (c) => { maxSlip = Math.max(maxSlip, c.slip); });
      return maxSlip;
    };
    expect(slipOn(SURFACE.ICE)).toBeGreaterThan(slipOn(SURFACE.ROAD) * 3);
  });

  it('boost pads fire once and add speed', () => {
    const world = new CollisionWorld();
    addRoadCollision(world, linePath(new Vector3(0, 0, -50), new Vector3(0, 0, 20)), { walls: [false, false] });
    addRoadCollision(world, linePath(new Vector3(0, 0, 20), new Vector3(0, 0, 30)), { walls: [false, false], surface: SURFACE.BOOST });
    addRoadCollision(world, linePath(new Vector3(0, 0, 30), new Vector3(0, 0, 500)), { walls: [false, false] });
    world.build();
    const car = spawn(world, new Vector3(0, RH, 0), 30);
    const seen = [];
    run(car, 1.2, { throttle: 1 }, (c) => { seen.push(...events(c)); });
    expect(seen.filter((e) => e === 'boostPad').length).toBe(1);
    const ref = spawn(flatWorld(), new Vector3(0, RH, 0), 30);
    run(ref, 1.2, { throttle: 1 });
    expect(car.speed).toBeGreaterThan(ref.speed + 8);
  });

  it('does not tunnel through the road when falling very fast', () => {
    const world = flatWorld();
    const car = new CarPhysics(world);
    car.reset(new Vector3(0, 30, 0), new Quaternion(), new Vector3(0, -150, 0));
    run(car, 1);
    expect(car.position.y).toBeGreaterThan(0.3);
    expect(car.grounded).toBe(true);
  });

  it('reports being flipped when resting on its roof', () => {
    const world = flatWorld();
    const car = new CarPhysics(world);
    car.reset(new Vector3(0, 1.5, 0), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI));
    run(car, 1.5);
    expect(car.flipped).toBe(true);
    expect(car.flippedTime).toBeGreaterThan(0.5);
    expect(car.position.y).toBeGreaterThan(0.3);
  });
});
