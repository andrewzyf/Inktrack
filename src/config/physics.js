/**
 * InkTrack driving-physics tuning.
 *
 * Every constant that shapes how the car *feels* lives here so handling can
 * be iterated on without touching the simulation code. Units are metres,
 * seconds and radians unless noted. The car's forward axis is local +Z.
 */
export const PHYSICS = {
  /** Fixed simulation rate. Timer, ghost and physics all run on this clock. */
  tickRate: 120,

  /** Arcade gravity — heavier than Earth for snappy, readable jumps. */
  gravity: 22,

  car: {
    /** Chassis centre height above the road when resting. */
    rideHeight: 0.55,
    /** Wheel ray origins in car space (x, y, z). Front wheels at +Z. */
    wheels: [
      [0.82, 0.0, 1.32],
      [-0.82, 0.0, 1.32],
      [0.82, 0.0, -1.28],
      [-0.82, 0.0, -1.28],
    ],
    /** How far below the chassis the wheel rays look for ground. */
    groundProbe: 1.6,
    /** Extra distance above ride height that still counts as "on the ground". */
    groundedSlack: 0.35,
  },

  engine: {
    /** Speed (m/s) → forward acceleration (m/s²). Linearly interpolated. */
    accelCurve: [
      [0, 24],
      [10, 22],
      [25, 17],
      [40, 10],
      [52, 4],
      [58, 0],
    ],
    /** Soft top speed on flat ground under engine power alone (≈ 209 km/h). */
    maxSpeed: 58,
    brakeDecel: 42,
    reverseAccel: 14,
    reverseMaxSpeed: 16,
    /** Constant rolling resistance when coasting (m/s²). */
    rollingDrag: 1.6,
    /** Quadratic air drag coefficient (per metre). */
    airDrag: 0.0006,
  },

  steering: {
    /** Peak yaw rate (rad/s) at `fullSteerSpeed`. */
    maxYawRate: 2.5,
    /** Below this speed steering authority ramps down to zero. */
    fullSteerSpeed: 9,
    /** Fraction of yaw rate kept at top speed (stability at speed). */
    highSpeedYawFactor: 0.62,
    /** How quickly the digital steer input eases toward its target (1/s). */
    steerRise: 9,
    steerFall: 14,
  },

  grip: {
    /** How quickly sideways velocity is killed on normal tarmac (1/s). */
    lateral: 12,
    /** Fraction of the scrubbed sideways speed converted into forward speed. */
    transfer: 0.8,
  },
};
