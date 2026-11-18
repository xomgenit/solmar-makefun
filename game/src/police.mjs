// police.mjs — the wanted system: heat, decay, and the SBPD response.
// On foot the law sends officers; behind the wheel it sends cruisers that
// pursue on the roads, ram, and give up their driver when the chase ends.
import { clamp, angleDiff, dist } from './util.mjs';
import { MAX_WANTED, RESPRAY_COST } from './config.mjs';
import { randomRoadPoint } from './city.mjs';
import { makeCar, updateCarPhysics } from './vehicles.mjs';
import { makeCop } from './people.mjs';

export function addWanted(G, n) {
  if (n <= 0) return;
  const before = G.wanted;
  G.wanted = clamp(G.wanted + n, 0, MAX_WANTED);
  G.wantedQuiet = 0;
  if (G.wanted > before) {
    G.wantedFlash = 1;
    G.effects.floater(G.player.x, G.player.y - 30, '★'.repeat(G.wanted), '#ffd94d', 22);
  }
}

// A crime only counts when someone sees it: a cop, or a ped close by.
export function witnessesNear(G, x, y, radius) {
  for (const cop of G.cops) {
    if (dist(x, y, cop.x, cop.y) < radius) return true;
  }
  for (const ped of G.peds) {
    if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < radius * 0.7) return true;
  }
  return false;
}

function nearestPursuerDist(G) {
  let best = Infinity;
  for (const cop of G.cops) best = Math.min(best, dist(cop.x, cop.y, G.player.x, G.player.y));
  for (const car of G.cars) {
    if (car.police && !car.wrecked) best = Math.min(best, dist(car.x, car.y, G.player.x, G.player.y));
  }
  return best;
}

function spawnFootCop(G) {
  const p = randomRoadPoint(G.city, G.rng, G.player.x, G.player.y, 420, 700);
  G.cops.push(makeCop(p.x, p.y));
}

function spawnCruiser(G) {
  const p = randomRoadPoint(G.city, G.rng, G.player.x, G.player.y, 480, 800);
  const car = makeCar('cruiser', p.x, p.y, Math.atan2(G.player.y - p.y, G.player.x - p.x), {
    driver: 'police',
  });
  G.cars.push(car);
}

export function updatePolice(G, dt) {
  const p = G.player;

  // Heat cools when no pursuer has been near for a while.
  if (G.wanted > 0) {
    if (nearestPursuerDist(G) > 560) {
      G.wantedQuiet += dt;
      if (G.wantedQuiet > 12) {
        G.wanted--;
        G.wantedQuiet = 0;
        G.effects.floater(p.x, p.y - 30, 'Heat cooling…', '#9ad8ff', 16);
      }
    } else {
      G.wantedQuiet = 0;
    }
  }
  G.sfx.setSiren(G.wanted > 0);
  if (G.wantedFlash > 0) G.wantedFlash -= dt;

  // Wrecked cruisers spill their driver onto the street.
  for (const car of G.cars) {
    if (car.police && car.needsCop) {
      car.needsCop = false;
      if (G.wanted > 0) G.cops.push(makeCop(car.x + 26, car.y));
    }
  }

  // Force levels: foot cops on foot, cruisers behind the wheel.
  const wantFoot = p.onFoot ? Math.min(G.wanted, 4) : 0;
  const wantCruisers = !p.onFoot && G.wanted > 0 ? clamp(G.wanted, 1, 4) : 0;
  const cruisers = G.cars.filter((c) => c.police && !c.wrecked);
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    G.spawnTimer = 1.1;
    if (G.cops.length < wantFoot) spawnFootCop(G);
    else if (cruisers.length < wantCruisers) spawnCruiser(G);
  }
  // Stand down when the heat is gone and the force is far away.
  if (G.wanted === 0) {
    for (const car of G.cars) {
      if (car.police && dist(car.x, car.y, p.x, p.y) > 800) {
        car.removeMe = true;
      }
    }
    G.cars = G.cars.filter((c) => !c.removeMe);
  }

  updateCruisers(G, dt);
}

function updateCruisers(G, dt) {
  const p = G.player;
  for (const car of G.cars) {
    if (!car.police || car.wrecked) continue;
    car.sirenPhase += dt * 9;
    // No heat, no chase: the driver stands down and the cruiser stays
    // parked where it stopped (a stealable prize, if anyone dares).
    if (G.wanted === 0) {
      car.driver = null;
      car.parked = true;
      continue;
    }
    // The driver bails out when the player is on foot and close.
    if (p.onFoot && dist(car.x, car.y, p.x, p.y) < 130 && G.cops.length < 4) {
      G.cops.push(makeCop(car.x + 24, car.y));
      car.driver = null;
      car.parked = true;
      continue;
    }
    if (car.driver !== 'police') continue;

    // Pursuit: aim ahead of the target, full throttle, hard steering.
    const lead = 0.35;
    const tx = p.x + (p.car ? p.car.vx : p.vx) * lead;
    const ty = p.y + (p.car ? p.car.vy : p.vy) * lead;
    const desired = Math.atan2(ty - car.y, tx - car.x);
    const steer = clamp(angleDiff(car.angle, desired) * 2.6, -1, 1);
    const speed = Math.hypot(car.vx, car.vy);

    // Stuck? Reverse out; if that keeps failing, re-deploy near the player.
    let throttle = 1;
    let brake = 0;
    let steerOut = steer;
    if (car.reverseT > 0) {
      car.reverseT -= dt;
      throttle = 0;
      brake = 1;
      steerOut = -steer;
    } else if (speed < 26) {
      car.stuckT += dt;
      if (car.stuckT > 2.2) {
        car.stuckT = 0;
        car.stuckCount = (car.stuckCount || 0) + 1;
        if (car.stuckCount >= 3) {
          car.stuckCount = 0;
          const rp = randomRoadPoint(G.city, G.rng, p.x, p.y, 380, 560);
          car.x = rp.x;
          car.y = rp.y;
          car.vx = 0;
          car.vy = 0;
          car.angle = Math.atan2(p.y - rp.y, p.x - rp.x);
        } else {
          car.reverseT = 0.9;
        }
      }
    } else {
      car.stuckT = 0;
    }
    updateCarPhysics(car, { throttle, brake, steer: steerOut, handbrake: false }, dt, G);
  }
}

// The Sunset Auto Spa respray: cash clears the wanted level and the dents.
export function tryRespray(G) {
  const p = G.player;
  if (p.onFoot || !p.car) return false;
  const spa = G.city.landmarks.spa;
  if (dist(p.x, p.y, spa.doorX, spa.doorY) > 130) return false;
  if (p.cash < RESPRAY_COST) {
    G.effects.floater(p.x, p.y - 30, `Need $${RESPRAY_COST}`, '#ff8a7a', 16);
    return false;
  }
  if (G.wanted === 0 && p.car.hp >= p.car.maxHp) return false;
  p.cash -= RESPRAY_COST;
  G.wanted = 0;
  G.wantedQuiet = 0;
  p.car.hp = p.car.maxHp;
  p.car.wrecked = false;
  G.sfx.jingle();
  G.effects.floater(p.x, p.y - 34, 'RESPRAYED — HEAT GONE', '#7ae8a0', 18);
  G.effects.burst(p.x, p.y, 18, '#7ae8a0', 140, 0.7, 3);
  return true;
}
