import { PHYSICS } from '../config/physics.js';

/**
 * Vehicle kinds and mutators. A track's theme decides the vehicle (land →
 * car, ocean → speedboat, sky → plane); each kind is the base PHYSICS table
 * with a few overrides, so the handling code stays shared.
 */

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge (objects only; arrays and scalars replace). */
export function merge(base, over) {
  if (!over) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

export const VEHICLES = {
  car: {
    name: 'Car',
    physics: null,
  },
  boat: {
    name: 'Speedboat',
    // Looser, floatier and bouncier: a boat slides through every corner.
    physics: {
      engine: {
        accelCurve: [[0, 19], [10, 17], [25, 13], [40, 9], [50, 5], [55, 2], [58, 0]],
        maxSpeed: 55,
        rollingDrag: 2.2,
      },
      steering: { maxYawRate: 2.3, highSpeedYawFactor: 0.7 },
      grip: { lateral: 4.2, transfer: 0.88, recoverTime: 0.5 },
      drift: { grip: 1.9, yawBase: 1.3, chargeRate: 0.8, minSpeed: 10 },
      walls: { restitution: 0.45, friction: 0.02 },
    },
  },
  plane: {
    name: 'Plane',
    physics: null, // FlightPhysics has its own table (FLIGHT)
  },
};

/** Arcade flight tuning (see FlightPhysics). */
export const FLIGHT = {
  cruise: 44, // m/s with no input
  minSpeed: 30,
  maxSpeed: 64,
  boostSpeed: 78,
  speedResponse: 0.8, // 1/s toward the target speed
  diveGain: 14, // extra m/s target per radian of dive
  pitchRate: 1.35, // rad/s at full up/down
  pitchLimit: 1.05,
  pitchLevel: 0.9, // auto-level rate with no pitch input (1/s)
  yawRate: 1.9, // rad/s at full steer
  driftYaw: 2.8, // rad/s while "drifting" (hard bank)
  bankAngle: 0.85,
  bankResponse: 5,
  radius: 1.3, // collision sphere against obstacles
};

/**
 * Mutators: optional twists for a run. They never save records (times
 * aren't comparable), but they do count for the daily challenge.
 */
export const MUTATORS = {
  lowGravity: { name: 'Moon Jump', icon: '🌙', desc: 'Half gravity. Big air!', physics: { gravity: 11 } },
  turbo: {
    name: 'Turbo',
    icon: '⚡',
    desc: 'Everything is faster',
    physics: { engine: { accelCurve: PHYSICS.engine.accelCurve.map(([s, a]) => [s * 1.25, a * 1.35]), maxSpeed: 72 }, boost: { maxSpeed: 88 } },
    flight: { cruise: 56, maxSpeed: 78, boostSpeed: 92 },
  },
  slick: { name: 'Butter Tyres', icon: '🧈', desc: 'Every road is slippery', physics: { grip: { lateral: 3.2 }, drift: { grip: 1.4 } }, flight: { yawRate: 0.95 } },
  tiny: { name: 'Mini', icon: '🐜', desc: 'A tiny vehicle in a big world', scale: 0.55 },
  night: { name: 'Night Ink', icon: '🌚', desc: 'Lights out — ink only', night: true },
};

export const MUTATOR_IDS = Object.keys(MUTATORS);

/** Physics config for a vehicle kind with mutators applied. */
export function physicsFor(kind = 'car', mutators = []) {
  let cfg = merge(PHYSICS, VEHICLES[kind]?.physics);
  for (const id of mutators) cfg = merge(cfg, MUTATORS[id]?.physics);
  return cfg;
}

export function flightFor(mutators = []) {
  let cfg = { ...FLIGHT };
  for (const id of mutators) cfg = merge(cfg, MUTATORS[id]?.flight);
  const g = mutators.includes('lowGravity') ? 0.5 : 1;
  return { ...cfg, gravityScale: g };
}

/** Which vehicle a theme races with. */
export function vehicleForTheme(theme) {
  return theme === 'ocean' ? 'boat' : theme === 'sky' ? 'plane' : 'car';
}
