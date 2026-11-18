// util.mjs — small math + seeded-random helpers shared by every SOLMAR system.
// No game logic here: pure functions so the city, traffic and tests stay deterministic.
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-arc angle interpolation: a and b in radians, t in [0,1].
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

// mulberry32: tiny fast seeded PRNG. One stream per game, so a saved seed
// rebuilds the exact same city, traffic colours and palm placement.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }
  int(lo, hi) {
    return Math.floor(this.range(lo, hi + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
}

// Push a circle out of an axis-aligned rect. Returns the corrected position
// plus whether a hit happened and the push-out normal.
export function resolveCircleRect(x, y, r, rx, ry, rw, rh) {
  const cx = clamp(x, rx, rx + rw);
  const cy = clamp(y, ry, ry + rh);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x, y, hit: false, nx: 0, ny: 0 };
  // Centre inside the rect: push out along the smallest penetration axis.
  if (d2 === 0) {
    const left = x - rx;
    const right = rx + rw - x;
    const top = y - ry;
    const bottom = ry + rh - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: rx - r, y, hit: true, nx: -1, ny: 0 };
    if (m === right) return { x: rx + rw + r, y, hit: true, nx: 1, ny: 0 };
    if (m === top) return { x, y: ry - r, hit: true, nx: 0, ny: -1 };
    return { x, y: ry + rh + r, hit: true, nx: 0, ny: 1 };
  }
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  return { x: cx + nx * r, y: cy + ny * r, hit: true, nx, ny };
}

export function pointInRect(x, y, rx, ry, rw, rh) {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

// Ray march against a predicate: returns distance to the first hit, or range.
export function rayMarch(x, y, angle, range, step, blocked) {
  for (let d = step; d <= range; d += step) {
    if (blocked(x + Math.cos(angle) * d, y + Math.sin(angle) * d)) return d;
  }
  return range;
}
