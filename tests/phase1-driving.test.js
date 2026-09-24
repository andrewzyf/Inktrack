import { describe, it, expect } from 'vitest';
import { CarPhysics } from '../src/physics/CarPhysics.js';
import { PHYSICS } from '../src/config/physics.js';
import { flatWorld, drive, heading, Vector3, Quaternion } from './helpers.js';

function spawn(world) {
  const car = new CarPhysics(world);
  car.reset(new Vector3(0, PHYSICS.car.rideHeight, 0), new Quaternion());
  return car;
}

describe('Phase 1 — basic arcade driving on a flat plane', () => {
  const world = flatWorld();

  it('rests on the ground at ride height', () => {
    const car = spawn(world);
    drive(car, 1, {});
    expect(car.grounded).toBe(true);
    expect(car.position.y).toBeCloseTo(PHYSICS.car.rideHeight, 1);
    expect(car.velocity.length()).toBeLessThan(0.05);
  });

  it('accelerates forward (+Z) under throttle', () => {
    const car = spawn(world);
    drive(car, 2, { throttle: 1 });
    expect(car.speed).toBeGreaterThan(25);
    expect(car.position.z).toBeGreaterThan(20);
    expect(Math.abs(car.position.x)).toBeLessThan(0.01);
  });

  it('brakes to a stop, then reverses', () => {
    const car = spawn(world);
    drive(car, 2, { throttle: 1 });
    const v0 = car.speed;
    let t = 0;
    while (car.speed > 0.5 && t < 5) { drive(car, 1 / 120, { brake: 1 }); t += 1 / 120; }
    expect(t).toBeLessThan(v0 / 30); // strong arcade brakes (> 30 m/s²)
    drive(car, 2, { brake: 1 });
    expect(car.speed).toBeLessThan(-5);
  });

  it('steers: right input turns the nose clockwise (toward -X)', () => {
    const car = spawn(world);
    drive(car, 1, { throttle: 1 });
    const h0 = heading(car);
    drive(car, 0.6, { throttle: 1, steer: 1 });
    expect(heading(car)).toBeLessThan(h0 - 0.4);
    expect(car.position.x).toBeLessThan(0);
    const car2 = spawn(world);
    drive(car2, 1, { throttle: 1 });
    drive(car2, 0.6, { throttle: 1, steer: -1 });
    expect(heading(car2)).toBeGreaterThan(0.4);
  });

  it('cannot steer while stationary', () => {
    const car = spawn(world);
    drive(car, 1, { steer: 1 });
    expect(Math.abs(heading(car))).toBeLessThan(1e-6);
  });
});

describe('Phase 1 — energy sanity', () => {
  const world = flatWorld(2000);
  it('never exceeds the engine top speed on flat ground, even while turning', () => {
    const car = new CarPhysics(world);
    car.reset(new Vector3(0, PHYSICS.car.rideHeight, 0), new Quaternion());
    let maxSeen = 0;
    for (let i = 0; i < 120 * 20; i++) {
      car.step(1 / 120, { throttle: 1, brake: 0, steer: (i >> 7) % 2 ? 1 : -1, drift: false });
      maxSeen = Math.max(maxSeen, car.velocity.length());
    }
    expect(maxSeen).toBeLessThanOrEqual(PHYSICS.engine.maxSpeed + 0.01);
  });
});
