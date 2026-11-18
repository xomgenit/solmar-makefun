// combat.mjs — hitscan gunplay: the player's shots, damage, and the Harbor
// Kings squad that defends the pier in mission 4. Bullets are ray marches,
// so walls stop them and tracers show exactly where they went.
import { clamp, dist } from './util.mjs';
import { buildingAt } from './city.mjs';
import { rayMarch } from './util.mjs';

const SHOT_RANGE = 540;

function blockedByCity(G, x, y) {
  return buildingAt(G.city, x, y) !== null;
}

// Ray march from (x,y) along angle: returns the first thing hit — a wall,
// a person, or a car — and the impact point. `foes` are the shootable people.
export function raycastShot(G, x, y, angle, foes) {
  const wallD = rayMarch(x, y, angle, SHOT_RANGE, 16, (px, py) => blockedByCity(G, px, py));
  let best = { dist: wallD, x: x + Math.cos(angle) * wallD, y: y + Math.sin(angle) * wallD, target: null, kind: 'wall' };
  const checkCircle = (cx, cy, r, target, kind) => {
    // Distance from the ray to the circle centre, projected along the ray.
    const dx = cx - x;
    const dy = cy - y;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along < 0 || along > best.dist) return;
    const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    if (perp < r + 4) {
      best = { dist: along, x: cx, y: cy, target, kind };
    }
  };
  for (const foe of foes) {
    if (foe.dead || foe.state === 'down') continue;
    checkCircle(foe.x, foe.y, 14, foe, foe.kind || 'person');
  }
  for (const car of G.cars) {
    if (car.wrecked || car.driver === 'player') continue;
    checkCircle(car.x, car.y, 19, car, 'car');
  }
  return best;
}

export function playerShoot(G) {
  const p = G.player;
  if (!p.onFoot || p.shootCd > 0) return;
  p.shootCd = 0.14;
  G.stats.shots++;
  const angle = p.aimAngle + (Math.random() - 0.5) * 0.03;
  const mx = p.x + Math.cos(angle) * 20;
  const my = p.y + Math.sin(angle) * 20;
  const foes = [...G.cops, ...G.enemies, ...G.peds];
  const hit = raycastShot(G, mx, my, angle, foes);
  G.effects.tracer(mx, my, hit.x, hit.y);
  G.effects.burst(mx, my, 3, '#ffe27a', 120, 0.12, 2);
  G.sfx.shot();
  G.lastShot = { x: p.x, y: p.y, t: G.time };
  if (hit.kind === 'wall') {
    G.effects.sparks(hit.x, hit.y);
    return;
  }
  if (hit.kind === 'car') {
    hit.target.hp -= 12;
    G.effects.sparks(hit.x, hit.y);
    if (hit.target.hp <= 0) wreckShotCar(G, hit.target);
    return;
  }
  const foe = hit.target;
  foe.hp -= 34;
  G.effects.hitPuff(foe.x, foe.y);
  if (foe.hp <= 0) killFoe(G, foe);
}

function wreckShotCar(G, car) {
  if (car.wrecked) return;
  car.hp = 0;
  car.wrecked = true;
  car.vx *= 0.2;
  car.vy *= 0.2;
  G.effects.burst(car.x, car.y, 22, '#ff8a3a', 260, 0.6, 4);
  if (car.police) car.needsCop = true;
}

function killFoe(G, foe) {
  foe.dead = true;
  G.effects.burst(foe.x, foe.y, 14, '#ff5a4a', 160, 0.5, 3);
  if (foe.kind === 'cop') {
    G.stats.kills++;
    // Cop down: the heat jumps, capped at 5.
    G.wanted = Math.min(5, G.wanted + 1);
    G.wantedFlash = 1;
  } else if (foe.kind === 'king') {
    G.stats.kills++;
    G.effects.floater(foe.x, foe.y - 24, 'KING DOWN', '#ffd94d', 16);
  } else {
    // A bystander: only counts if someone saw it happen.
    G.stats.kills++;
  }
}

export function damagePlayer(G, amount, fromX, fromY) {
  const p = G.player;
  if (p.invuln > 0 || G.screen !== 'play') return;
  p.hp -= amount;
  G.flash = Math.min(1, G.flash + 0.45);
  G.effects.shake(3);
  if (p.hp <= 0) {
    p.hp = 0;
    G.pendingEnd = 'wasted';
  }
  void fromX;
  void fromY;
}

// ---- Harbor Kings: mission 4's defending squad --------------------------

export function spawnEnemySquad(G, x, y, n) {
  const spots = [
    { dx: -60, dy: -40 }, { dx: 70, dy: -70 }, { dx: -90, dy: 60 }, { dx: 40, dy: 90 },
    { dx: 110, dy: 20 }, { dx: -30, dy: -110 },
  ];
  for (let i = 0; i < n; i++) {
    const s = spots[i % spots.length];
    G.enemies.push({
      kind: 'king', x: x + s.dx, y: y + s.dy, angle: 0, hp: 60,
      shootCd: 0.6 + Math.random() * 0.8, dead: false,
      strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
      walkPhase: Math.random() * 6,
    });
  }
}

function enemyHasSight(G, e, p) {
  const d = dist(e.x, e.y, p.x, p.y);
  if (d > 430) return false;
  const steps = Math.ceil(d / 26);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (buildingAt(G.city, e.x + (p.x - e.x) * t, e.y + (p.y - e.y) * t)) return false;
  }
  return true;
}

export function updateEnemies(G, dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    // Strafe to keep the fight moving; close in when far away.
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      e.strafeT = 0.9 + Math.random() * 0.9;
      e.strafeDir = Math.random() < 0.5 ? 1 : -1;
    }
    let mx = 0;
    let my = 0;
    if (d > 320) {
      mx = Math.cos(e.angle);
      my = Math.sin(e.angle);
    } else {
      mx = -Math.sin(e.angle) * e.strafeDir;
      my = Math.cos(e.angle) * e.strafeDir;
    }
    const sp = d > 320 ? 150 : 90;
    e.x += mx * sp * dt;
    e.y += my * sp * dt;
    e.walkPhase += dt * 10;

    e.shootCd -= dt;
    if (e.shootCd <= 0 && enemyHasSight(G, e, p)) {
      e.shootCd = 0.85 + Math.random() * 0.6;
      const miss = Math.random() < 0.4;
      const tx = p.x + (miss ? (Math.random() - 0.5) * 110 : 0);
      const ty = p.y + (miss ? (Math.random() - 0.5) * 110 : 0);
      G.effects.tracer(e.x, e.y, tx, ty, '#ff9a7a');
      if (d < 750) G.sfx.shot();
      if (!miss) damagePlayer(G, 6 + Math.random() * 5, e.x, e.y);
      G.lastShot = { x: e.x, y: e.y, t: G.time };
    }
  }
  G.enemies = G.enemies.filter((e) => !e.dead);
}

export function enemiesLeft(G) {
  return G.enemies.filter((e) => !e.dead).length;
}
