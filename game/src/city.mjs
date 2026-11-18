// city.mjs — Solmar Bay, generated from a seed: street grid, blocks,
// pastel buildings, named landmarks, palms, beach and sea. Deterministic:
// the same seed rebuilds the same city, so a save file only stores the seed.
import { Rng, clamp, resolveCircleRect } from './util.mjs';
import {
  WORLD_W, WORLD_H, ROAD_W, ROAD_GAP, ROAD_FIRST, BEACH_Y, SEA_Y,
  BUILDING_COLORS,
} from './config.mjs';

export const ROAD_HALF = ROAD_W / 2;

// Landmark blocks (column,row in the 9x6 interior block grid) and their doors.
// Doors sit on the street side so mission markers are always reachable.
const LANDMARKS = [
  { id: 'hideout', name: "Dice's Hideout", col: 1, row: 1, color: '#e8a34a', w: 250, h: 200 },
  { id: 'diner', name: "Vera's Diner", col: 3, row: 1, color: '#e88aa0', w: 280, h: 210 },
  { id: 'bank', name: 'Solmar National Bank', col: 4, row: 2, color: '#d8d8e8', w: 300, h: 230 },
  { id: 'garage', name: "Ray's Garage", col: 6, row: 3, color: '#8ac8e8', w: 280, h: 210 },
  { id: 'spa', name: 'Sunset Auto Spa', col: 2, row: 4, color: '#a0e8c8', w: 260, h: 200 },
  { id: 'sbpd', name: 'SBPD Headquarters', col: 5, row: 4, color: '#9ab8d8', w: 300, h: 230 },
  { id: 'hospital', name: 'Solmar General', col: 7, row: 1, color: '#f2f2f2', w: 300, h: 220 },
];

export function buildCity(seed) {
  const rng = new Rng(seed);
  const roadsV = [];
  const roadsH = [];
  for (let i = 0; i < 10; i++) roadsV.push(ROAD_FIRST + i * ROAD_GAP);
  for (let j = 0; j < 7; j++) roadsH.push(ROAD_FIRST + j * ROAD_GAP);

  const buildings = [];
  const landmarkById = {};
  const blockX = (i) => roadsV[i] + ROAD_HALF + 24;
  const blockW = ROAD_GAP - ROAD_W - 48; // 352

  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 6; j++) {
      const bx = blockX(i);
      const by = blockX(j); // same spacing on both axes
      const mark = LANDMARKS.find((l) => l.col === i && l.row === j);
      if (mark) {
        const w = mark.w;
        const h = mark.h;
        const x = bx + (blockW - w) / 2;
        const y = by + (blockW - h) / 2;
        const b = { x, y, w, h, color: mark.color, roof: '#8a7a5a', landmark: mark.id, label: mark.name, detail: rng.int(0, 3), shadow: 12 };
        buildings.push(b);
        landmarkById[mark.id] = {
          ...mark, x: x + w / 2, y: y + h / 2,
          doorX: x + w / 2, doorY: y + h + 40, building: b,
        };
        continue;
      }
      if (rng.chance(0.62)) {
        const w = rng.int(200, 300);
        const h = rng.int(180, 280);
        buildings.push({
          x: bx + (blockW - w) / 2 + rng.int(-12, 12),
          y: by + (blockW - h) / 2 + rng.int(-12, 12),
          w, h, color: rng.pick(BUILDING_COLORS),
          roof: '#b9ac8d', detail: rng.int(0, 3), shadow: rng.int(6, 12),
        });
      } else {
        const w = rng.int(140, 165);
        const h = rng.int(180, 260);
        buildings.push({
          x: bx + 8, y: by + (blockW - h) / 2, w, h,
          color: rng.pick(BUILDING_COLORS), roof: '#b9ac8d',
          detail: rng.int(0, 3), shadow: rng.int(6, 12),
        });
        buildings.push({
          x: bx + blockW - w - 8, y: by + (blockW - h) / 2, w, h: rng.int(180, 260),
          color: rng.pick(BUILDING_COLORS), roof: '#b9ac8d',
          detail: rng.int(0, 3), shadow: rng.int(6, 12),
        });
      }
    }
  }

  // Docks: concrete platform + crates on the east edge.
  const crates = [];
  for (let k = 0; k < 9; k++) {
    crates.push({
      x: 4980 + (k % 3) * 48, y: 2650 + Math.floor(k / 3) * 48,
      w: 34, h: 34, color: '#c98a4a', roof: '#a86a32', detail: 0, shadow: 4, crate: true,
    });
  }
  landmarkById.docks = { id: 'docks', name: 'Solmar Docks', x: 5020, y: 2860, doorX: 4900, doorY: 2860 };
  landmarkById.pier = { id: 'pier', name: 'Solmar Pier', x: 2600, y: 3600, doorX: 2600, doorY: 3545 };

  // Palms: a breezy row along the beach plus scattered sidewalk palms.
  const palms = [];
  for (let x = 120; x < WORLD_W - 60; x += 130) {
    palms.push({ x: x + rng.int(-30, 30), y: BEACH_Y + rng.int(18, 110), s: rng.range(0.85, 1.25) });
  }
  for (let k = 0; k < 70; k++) {
    const vertical = rng.chance(0.5);
    const road = vertical ? rng.pick(roadsV) : rng.pick(roadsH);
    const along = rng.range(300, vertical ? WORLD_H - 500 : WORLD_W - 300);
    const off = (ROAD_HALF + 14) * (rng.chance(0.5) ? 1 : -1);
    const px = vertical ? road + off : along;
    const py = vertical ? along : road + off;
    if (!buildingAtPoint(buildings, px, py, 20)) palms.push({ x: px, y: py, s: rng.range(0.8, 1.2) });
  }

  const intersections = [];
  for (const x of roadsV) for (const y of roadsH) intersections.push({ x, y });

  return {
    seed, roadsV, roadsH, buildings, crates, palms, intersections,
    landmarks: landmarkById,
    obstacles: buildings.concat(crates),
  };
}

function buildingAtPoint(buildings, x, y, pad) {
  for (const b of buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  return false;
}

export function zoneAt(x, y) {
  if (y >= 3450) return 'PALMA BEACH';
  if (x >= 4200) return 'EAST HARBOUR';
  if (y < 700) return 'NORTHSIDE';
  if (x < 1560) return 'OLD TOWN';
  if (x <= 3640) return 'DOWNTOWN';
  return 'MARINA DISTRICT';
}

export function roadAt(city, x, y) {
  for (const rx of city.roadsV) if (Math.abs(x - rx) <= ROAD_HALF) return true;
  for (const ry of city.roadsH) if (Math.abs(y - ry) <= ROAD_HALF) return true;
  return false;
}

export function buildingAt(city, x, y) {
  for (const b of city.obstacles) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// Resolve a circle against buildings, the sea and the world edge.
// Returns the corrected position and the impact normal (0,0 when no hit).
export function collideCircle(city, x, y, r) {
  let hit = false;
  let nx = 0;
  let ny = 0;
  for (const b of city.obstacles) {
    // Cheap broad-phase reject before the precise test.
    if (x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
    const res = resolveCircleRect(x, y, r, b.x, b.y, b.w, b.h);
    if (res.hit) { x = res.x; y = res.y; hit = true; nx = res.nx; ny = res.ny; }
  }
  if (y + r > SEA_Y) { y = SEA_Y - r; hit = true; ny = -1; }
  x = clamp(x, 30 + r, WORLD_W - 30 - r);
  y = clamp(y, 30 + r, WORLD_H - 30 - r);
  return { x, y, hit, nx, ny };
}

// Nearest point on a road centreline, for spawning traffic near the player.
export function nearestRoadPoint(city, x, y) {
  let bestX = city.roadsV[0];
  let bestDx = Infinity;
  for (const rx of city.roadsV) {
    const d = Math.abs(x - rx);
    if (d < bestDx) { bestDx = d; bestX = rx; }
  }
  let bestY = city.roadsH[0];
  let bestDy = Infinity;
  for (const ry of city.roadsH) {
    const d = Math.abs(y - ry);
    if (d < bestDy) { bestDy = d; bestY = ry; }
  }
  return bestDx <= bestDy ? { x: bestX, y } : { x, y: bestY };
}

export function randomRoadPoint(city, rng, cx, cy, minD, maxD) {
  for (let k = 0; k < 14; k++) {
    let px;
    let py;
    if (rng.chance(0.5)) {
      px = rng.pick(city.roadsV);
      py = rng.range(300, WORLD_H - 500);
    } else {
      px = rng.pick(city.roadsH);
      py = rng.range(300, WORLD_W - 300);
      const t = px; px = py; py = t;
    }
    const d = Math.hypot(px - cx, py - cy);
    if (d >= minD && d <= maxD) return { x: px, y: py };
  }
  const near = nearestRoadPoint(city, cx, cy);
  return { x: near.x + minD * 0.7, y: near.y };
}
