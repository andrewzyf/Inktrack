/**
 * InkTrack driving-physics tuning.
 *
 * Every constant that shapes how the car *feels* lives here so handling can
 * be iterated on without touching the simulation code. Units are metres,
 * seconds and radians unless noted. The car's forward axis is local +Z,
 * local +X is the driver's LEFT (three.js right-handed, Y up).
 *
 * Tip: in the browser console `INKTRACK.physics` is this object — values can
 * be edited live while driving.
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
    /** Spheres used against walls/barriers: [x, y, z, radius] in car space. */
    wallSpheres: [
      [0, 0.25, 1.25, 0.95],
      [0, 0.25, 0, 0.95],
      [0, 0.25, -1.25, 0.95],
    ],
    /** Small spheres that stop the body sinking into the road when not on its wheels. */
    bodySpheres: [
      [0, 0.55, -0.2, 0.5], // roof
      [0, 0.05, 1.95, 0.35], // nose
      [0, 0.05, -1.95, 0.35], // tail
    ],
  },

  engine: {
    /** Speed (m/s) → forward acceleration (m/s²). Linearly interpolated. */
    accelCurve: [
      [0, 21],
      [10, 19],
      [25, 15],
      [40, 10],
      [52, 6],
      [58, 2.4],
      [62, 0],
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
    /** Fraction of the scrubbed sideways speed redirected along the nose. */
    transfer: 0.8,
    /** Seconds for grip to recover after a drift ends (prevents a snap). */
    recoverTime: 0.3,
  },

  drift: {
    /** Speed needed to start (and keep) a drift. */
    minSpeed: 12,
    /** Steering needed (with drift held) to kick into a drift. */
    minSteer: 0.25,
    /** Lateral grip while drifting — lower = longer slides. */
    grip: 3.2,
    /** Speed kept when sliding (redirect fraction). */
    transfer: 0.93,
    /** Yaw rate into the drift with neutral steering (rad/s). */
    yawBase: 1.45,
    /** Extra (steering into) / reduced (counter-steering) yaw rate. */
    yawSteer: 1.05,
    /** Instant yaw kick when a drift starts (rad) — gives the flick feel. */
    entryKick: 0.06,
    /** Boost meter gained per second of a full-slip drift. */
    chargeRate: 0.62,
    /** Slip ratio (sideways/forward speed) that counts as a "full" slide. */
    fullSlip: 0.3,
    /** Meter needed to earn any boost on release. */
    minCharge: 0.2,
  },

  boost: {
    /** Extra forward acceleration while a boost is active (m/s²). */
    accel: 30,
    /** Speed cap while boosting (≈ 259 km/h). */
    maxSpeed: 72,
    /** Boost seconds awarded by a full drift meter. */
    driftDuration: 1.4,
    /** Boost pads: duration and instant kick. */
    padDuration: 1.1,
    padImpulse: 6,
  },

  /** Per-surface multipliers. */
  surfaces: {
    road: { grip: 1, accel: 1, brake: 1, steer: 1 },
    ice: { grip: 0.14, accel: 0.7, brake: 0.35, steer: 0.85 },
    boost: { grip: 1, accel: 1, brake: 1, steer: 1 },
  },

  ground: {
    /** Arcade adhesion that resists leaving the road (helps loops). m/s² */
    stick: 9,
    /** Extra adhesion per m/s of speed. */
    stickPerSpeed: 0.12,
    /** Normal-velocity below which curvature is followed without losing speed. */
    smoothFollow: 4,
    /** Landing impacts above this (m/s into the road) fire a "landed" event. */
    landEvent: 5,
    /** How fast the chassis aligns to the road on hard landings (1/s). */
    alignRate: 18,
    /** On guided pieces (loops) the entry angle relaxes toward straight at this rate (1/s). */
    guideCentering: 1.5,
  },

  air: {
    /** Steering yaws the car in the air at up to this rate (rad/s). */
    yawRate: 2.4,
    /** Nose follows the flight path at this gain (0 = keeps take-off rotation). */
    pitchAlign: 1.6,
    /** Manual pitch with throttle/brake in the air (off: holding gas would nose-dive). */
    pitchControl: false,
    pitchRate: 2.2,
    /** How quickly air rotation approaches the input target (1/s). */
    response: 3.5,
    /** Align to the road beneath when about to land (1/s). */
    landingAssist: 5,
  },

  walls: {
    /** Bounce off barriers (0 = dead stop into wall, 1 = perfect bounce). */
    restitution: 0.15,
    /** Speed lost along the wall per m/s of impact. */
    friction: 0.035,
    /** Nose is steered along the wall by this fraction on impact. */
    alignFactor: 0.35,
    /** Impacts above this speed fire a "wall" event. */
    impactEvent: 7,
  },
};
