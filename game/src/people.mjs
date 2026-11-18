// people.mjs — the city's pedestrians and the SBPD officers on foot.
// Peds wander the sidewalks, flee from danger and get knocked down; cops
// chase the player, shoot when they have a line of sight, and bust him
// if they can stand next to him long enough.
import { clamp, dist, angleLerp, Rng } from './util.mjs';
import { WORLD_W, WORLD_H, ROAD_W } from './config.mjs';
import { collideCircle, buildingAt, randomRoadPoint } from './city.mjs';
import { damagePlayer } from './combat.mjs';

const SHIRTS = ['#e84a4a', '#4a7dd8', '#3aa655', '#e8c94a', '#9a5ad8', '#e87a4a', '#4ad8c9', '#f2f2f2'];
const SKINS = ['#f2c9a0', '#c98a5a', '#8a5a32', '#e8b88a'];

export function makePed(x, y, rng) {
  return {
    x, y, angle: rng.range(0, Math.PI * 2),
    speed: rng.range(52, 82), state: 'walk',
    tx: x, ty: y, waitT: rng.range(0, 2), downT: 0, fleeT: 0,
    kx: 0, ky: 0, hp: 30,
    shirt: rng.pick(SHIRTS), skin: rng.pick(SKINS),
    walkPhase: rng.range(0, Math.PI * 2),
  };
}

export function spawnPeds(G, n) {
  const rng = new Rng((G.seed ^ 0x51ed) >>> 0);
  for (let k = 0; k < n; k++) {
    const p = randomRoadPoint(G.city, rng, G.player.x, G.player.y, 100, 1600);
    const off = (ROAD_W / 2 + 16) * (rng.chance(0.5) ? 1 : -1);
    const vertical = rng.chance(0.5);
    const ped = makePed(
      vertical ? p.x + off : p.x,
      vertical ? p.y : p.y + off,
      rng,
    );
    ped.tx = ped.x;
    ped.ty = ped.y;
    G.peds.push(ped);
  }
}

function pickStrollTarget(G, ped) {
  const p = randomRoadPoint(G.city, G.rng, ped.x, ped.y, 120, 420);
  const off = (ROAD_W / 2 + 16) * (Math.random() < 0.5 ? 1 : -1);
  if (Math.random() < 0.5) { ped.tx = p.x + off; ped.ty = p.y; }
  else { ped.tx = p.x; ped.ty = p.y + off; }
}

export function knockPed(G, ped, vx, vy) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downT = 3;
  ped.kx = vx * 0.6;
  ped.ky = vy * 0.6;
  G.effects.hitPuff(ped.x, ped.y, '#ff5a4a');
}

export function updatePeds(G, dt) {
  const threat = G.lastShot; // {x, y, t} — gunshots scare peds
  for (const ped of G.peds) {
    // Knock slide decays.
    if (ped.kx !== 0 || ped.ky !== 0) {
      ped.x += ped.kx * dt;
      ped.y += ped.ky * dt;
      ped.kx *= Math.exp(-4 * dt);
      ped.ky *= Math.exp(-4 * dt);
      if (Math.abs(ped.kx) < 2) { ped.kx = 0; ped.ky = 0; }
    }
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) {
        ped.state = 'flee';
        ped.fleeT = 2.5;
        const a = Math.atan2(ped.y - G.player.y, ped.x - G.player.x);
        ped.tx = ped.x + Math.cos(a) * 300;
        ped.ty = ped.y + Math.sin(a) * 300;
      }
      continue;
    }
    // Flee triggers: nearby gunshot, or a fast car bearing down.
    if (ped.state === 'walk') {
      let flee = false;
      if (threat && G.time - threat.t < 1.2 && dist(ped.x, ped.y, threat.x, threat.y) < 520) flee = true;
      const pc = G.player.car;
      if (pc && dist(ped.x, ped.y, pc.x, pc.y) < 170 && Math.hypot(pc.vx, pc.vy) > 200) flee = true;
      if (flee) {
        ped.state = 'flee';
        ped.fleeT = 2.5;
        const a = Math.atan2(ped.y - G.player.y, ped.x - G.player.x);
        ped.tx = ped.x + Math.cos(a) * 320;
        ped.ty = ped.y + Math.sin(a) * 320;
      }
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      if (ped.fleeT <= 0) { ped.state = 'walk'; ped.waitT = 1; }
    }
    if (ped.state === 'walk' && ped.waitT > 0) {
      ped.waitT -= dt;
      continue;
    }
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 14) {
      if (ped.state === 'walk') { ped.waitT = 1 + Math.random() * 2.5; pickStrollTarget(G, ped); }
      else { ped.tx = ped.x; ped.ty = ped.y; }
      continue;
    }
    const speed = ped.state === 'flee' ? 215 : ped.speed;
    const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle = angleLerp(ped.angle, want, Math.min(1, 8 * dt));
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    ped.walkPhase += dt * speed * 0.06;
    const res = collideCircle(G.city, ped.x, ped.y, 11);
    ped.x = res.x;
    ped.y = res.y;
    ped.x = clamp(ped.x, 40, WORLD_W - 40);
    ped.y = clamp(ped.y, 40, WORLD_H - 40);
  }
  // Recycle peds that drifted far from the action.
  for (const ped of G.peds) {
    if (dist(ped.x, ped.y, G.player.x, G.player.y) > 1700 && ped.state !== 'down') {
      const p = randomRoadPoint(G.city, G.rng, G.player.x, G.player.y, 500, 1000);
      ped.x = p.x;
      ped.y = p.y;
      ped.tx = p.x;
      ped.ty = p.y;
      ped.state = 'walk';
    }
  }
}

export function makeCop(x, y) {
  return {
    kind: 'cop', x, y, angle: 0, hp: 50, speed: 246,
    shootCd: 0.5 + Math.random(), bustT: 0, dead: false,
    walkPhase: Math.random() * 6,
  };
}

function hasLineOfSight(G, x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  const steps = Math.ceil(d / 26);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (buildingAt(G.city, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

export function updateCops(G, dt) {
  const p = G.player;
  for (const cop of G.cops) {
    if (cop.dead) continue;
    // No heat, no chase: officers holster up and walk off the scene.
    if (G.wanted === 0) {
      const away = Math.atan2(cop.y - p.y, cop.x - p.x);
      cop.angle = angleLerp(cop.angle, away, Math.min(1, 6 * dt));
      cop.x += Math.cos(cop.angle) * 120 * dt;
      cop.y += Math.sin(cop.angle) * 120 * dt;
      cop.walkPhase += dt * 8;
      const res = collideCircle(G.city, cop.x, cop.y, 12);
      cop.x = res.x;
      cop.y = res.y;
      continue;
    }
    const d = dist(cop.x, cop.y, p.x, p.y);
    const want = Math.atan2(p.y - cop.y, p.x - cop.x);
    // A cop never stands in front of a speeding car: dodge to the side of
    // its path instead of running into the grille (in v4, foot cops kept
    // charging the player's car and getting run over, spiralling the heat).
    const playerCar = p.car;
    const carSpeed = playerCar ? Math.hypot(playerCar.vx, playerCar.vy) : 0;
    if (!p.onFoot && carSpeed > 120 && d < 280) {
      const carAngle = Math.atan2(playerCar.vy, playerCar.vx);
      const toCop = Math.atan2(cop.y - playerCar.y, cop.x - playerCar.x);
      const side = Math.sin(toCop - carAngle) >= 0 ? 1 : -1;
      const dodge = carAngle + side * Math.PI / 2;
      cop.angle = angleLerp(cop.angle, dodge, Math.min(1, 10 * dt));
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      cop.walkPhase += dt * 11;
      const res = collideCircle(G.city, cop.x, cop.y, 12);
      cop.x = res.x;
      cop.y = res.y;
    } else {
      cop.angle = angleLerp(cop.angle, want, Math.min(1, 10 * dt));
      // Chase, but hold a firing ring instead of piling onto the player.
      const chaseSpeed = d > 130 ? cop.speed : cop.speed * 0.45;
      cop.x += Math.cos(cop.angle) * chaseSpeed * dt;
      cop.y += Math.sin(cop.angle) * chaseSpeed * dt;
      cop.walkPhase += dt * 11;
      const res = collideCircle(G.city, cop.x, cop.y, 12);
      cop.x = res.x;
      cop.y = res.y;
    }

    cop.shootCd -= dt;
    if (d < 320 && cop.shootCd <= 0 && hasLineOfSight(G, cop.x, cop.y, p.x, p.y)) {
      cop.shootCd = 0.7 + Math.random() * 0.5;
      const miss = Math.random() < 0.35;
      const tx = p.x + (miss ? (Math.random() - 0.5) * 90 : 0);
      const ty = p.y + (miss ? (Math.random() - 0.5) * 90 : 0);
      G.effects.tracer(cop.x, cop.y, tx, ty, '#ffd27a');
      if (d < 750) G.sfx.shot();
      if (!miss) damagePlayer(G, 5 + Math.random() * 4, cop.x, cop.y);
      G.lastShot = { x: cop.x, y: cop.y, t: G.time };
    }

    // Busted: a cop standing on the player while he dawdles on foot.
    const playerSpeed = p.onFoot ? Math.hypot(p.vx, p.vy) : 999;
    if (d < 30 && p.onFoot && playerSpeed < 70) {
      cop.bustT += dt;
      if (cop.bustT > 3.5) G.pendingEnd = 'busted';
    } else {
      cop.bustT = Math.max(0, cop.bustT - dt);
    }
  }
  // Gentle separation so cops don't stack into one sprite.
  for (let i = 0; i < G.cops.length; i++) {
    for (let j = i + 1; j < G.cops.length; j++) {
      const a = G.cops[i];
      const b = G.cops[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 26 * 26 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (26 - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
  }
  G.cops = G.cops.filter((c) => !c.dead && (G.wanted > 0 || dist(c.x, c.y, p.x, p.y) < 700));
}
