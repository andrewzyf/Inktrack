/** Grid & road dimensions shared by pieces, builder, editor and decor. */
export const TILE = 10; // metres per grid cell (horizontal)
export const LEVEL = 2.5; // metres per height level
export const ROAD_WIDTH = 8.4;
export const WALL_HEIGHT = 1.0;
/** Collision barriers are taller than they look so side hits can't vault the car over. */
export const WALL_COLLISION_HEIGHT = 2.4;
export const WALL_THICKNESS = 0.5;
export const SLAB = 0.7; // road deck thickness under the surface

/** Grid directions: 0 = +Z (north), 1 = +X, 2 = -Z, 3 = -X. */
export const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

export const opposite = (d) => (d + 2) % 4;

/** Rotate a local cell offset by r quarter-turns (matches rotation.y = r·90°). */
export function rotateCell(x, z, r) {
  switch (((r % 4) + 4) % 4) {
    case 0: return [x, z];
    case 1: return [z, -x];
    case 2: return [-x, -z];
    default: return [-z, x];
  }
}
