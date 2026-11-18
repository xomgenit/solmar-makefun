// vehicles.mjs — cars: arcade physics, traffic AI, parked cars, stealing.
// One physics step serves the player, traffic and coasting wrecks alike;
// only the control input differs (player keys, traffic autopilot, none).
import { clamp, angleDiff, dist, Rng } from './util.mjs';
import { CAR_MODELS, ROAD_W, WORLD_W, WORLD_H, SEA_Y } from './config.mjs';
import { collideCircle, roadAt, randomRoadPoint, nearestRoadPoint } from './city.mjs';

let nextCarId = 1;

export function makeCar(model, x, y, angle, opts = {}) {
  const spec = CAR_MODELS[model];
  const car = {
    id: nextCarId++,
    model,
    label: spec.label,
    x, y, angle,
    vx: 0, vy: 0,
    hp: spec.hp, maxHp: spec.hp,
    color: opts.color || spec.colors[Math.floor(Math.random() * spec.colors.length)],
    topSpeed: spec.topSpeed, accel: spec.accel, brake: spec.brake,
    grip: spec.grip, turn: spec.turn, len: spec.len, wid: spec.wid,
    parked: !!opts.parked,
    traffic: !!opts.traffic,
    police: model === 'cruiser',
    wrecked: false,
    driver: opts.driver || null,
    route: null,
    cruise: spec.topSpeed * 0.55,
    stuckT: 0,
    reverseT: 0,
    smokeT: 0,
    needsCop: false,
    sirenPhase: Math.random() * Math.PI * 2,
    lastSkidX: x,
    lastSkidY: y,
  };
  return car;
}

// Arcade bicycle-ish model: forward speed along the heading, lateral slide
// damped by grip (handbrake kills the grip, so the car drifts).
export function updateCarPhysics(car, ctrl, dt, G) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const px = -fy;
  const py = fx;
  let fSpeed = car.vx * fx + car.vy * fy;
  let lat = car.vx * px + car.vy * py;

  const speed01 = clamp(Math.abs(fSpeed) / car.topSpeed, 0, 1);
  const steerAuthority = clamp(Math.abs(fSpeed) / 130, 0, 1) * (1 - 0.3 * speed01);
  car.angle += ctrl.steer * car.turn * steerAuthority * (fSpeed >= 0 ? 1 : -1) * dt * (ctrl.handbrake ? 1.5 : 1);

  if (ctrl.throttle > 0 && fSpeed < car.topSpeed) {
    fSpeed += car.accel * ctrl.throttle * dt;
  }
  if (ctrl.brake > 0) {
    if (fSpeed > 8) fSpeed -= car.brake * ctrl.brake * dt;
    else fSpeed = Math.max(-150, fSpeed - car.accel * 0.55 * ctrl.brake * dt);
  }
  // Drag + rolling resistance.
  fSpeed -= fSpeed * 0.32 * dt;
  if (ctrl.throttle === 0 && ctrl.brake === 0) {
    fSpeed -= Math.sign(fSpeed) * Math.min(Math.abs(fSpeed), 42 * dt);
  }
  const grip = ctrl.handbrake ? 1.1 : car.grip;
  lat *= Math.exp(-grip * dt);
  if (ctrl.handbrake) fSpeed -= fSpeed * 0.5 * dt;

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  const npx = -nfy;
  const npy = nfx;
  car.vx = nfx * fSpeed + npx * lat;
  car.vy = nfy * fSpeed + npy * lat;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Drift marks + tyre smoke while sliding sideways at speed.
  if (Math.abs(lat) > 70 && Math.abs(fSpeed) > 120) {
    G.effects.skid(car.lastSkidX, car.lastSkidY, car.x, car.y);
    if (Math.random() < 0.5) G.effects.smoke(car.x - nfx * 14, car.y - nfy * 14);
  }
  car.lastSkidX = car.x;
  car.lastSkidY = car.y;

  // Two-circle body (nose + tail) against buildings, sea and world edge.
  const r = car.wid * 0.78;
  for (const off of [car.len * 0.3, -car.len * 0.3]) {
    const cx = car.x + nfx * off;
    const cy = car.y + nfy * off;
    const res = collideCircle(G.city, cx, cy, r);
    if (res.hit) {
      const impact = Math.abs(car.vx * res.nx + car.vy * res.ny);
      car.x += res.x - cx;
      car.y += res.y - cy;
      // Kill the velocity component into the wall, keep a small bounce.
      const vn = car.vx * res.nx + car.vy * res.ny;
      if (vn < 0) {
        car.vx -= vn * res.nx * 1.25;
        car.vy -= vn * res.ny * 1.25;
      }
      if (impact > 180) {
        damageCar(G, car, impact * 0.022);
        G.effects.sparks(res.x, res.y);
        if (car.driver === 'player') {
          G.sfx.crash(Math.min(1, impact / 420));
          G.effects.shake(Math.min(8, impact / 60));
        }
      }
    }
  }
  car.x = clamp(car.x, 40, WORLD_W - 40);
  car.y = clamp(car.y, 40, SEA_Y - 20);
}

export function spawnParkedCars(city, rng, n) {
  const cars = [];
  const models = ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'sports'];
  for (let k = 0; k < n; k++) {
    const vertical = rng.chance(0.5);
    const road = vertical ? rng.pick(city.roadsV) : rng.pick(city.roadsH);
    const along = rng.range(320, (vertical ? 3400 : 4900));
    const side = rng.chance(0.5) ? 1 : -1;
    const off = side * (ROAD_W / 2 - 20);
    const x = vertical ? road + off : along;
    const y = vertical ? along : road + off;
    const angle = vertical ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    cars.push(makeCar(rng.pick(models), x, y, angle, { parked: true }));
  }
  return cars;
}

function pickRouteTarget(G, car) {
  const city = G.city;
  // Drive to the next intersection along the current heading, then choose.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const horizontal = Math.abs(fx) > Math.abs(fy);
  const dir = horizontal ? Math.sign(fx) : Math.sign(fy);
  const road = horizontal
    ? city.roadsH.reduce((a, b) => (Math.abs(car.y - a) < Math.abs(car.y - b) ? a : b))
    : city.roadsV.reduce((a, b) => (Math.abs(car.x - a) < Math.abs(car.x - b) ? a : b));
  const lane = 26;
  if (horizontal) {
    const nextX = city.roadsV.find((rx) => (dir > 0 ? rx > car.x + 60 : rx < car.x - 60));
    if (nextX === undefined) return { x: car.x - dir * 400, y: road + lane * dir, turn: true };
    return { x: nextX, y: road + lane * dir, turn: false };
  }
  const nextY = city.roadsH.find((ry) => (dir > 0 ? ry > car.y + 60 : ry < car.y - 60));
  if (nextY === undefined) return { x: road - lane * dir, y: car.y - dir * 400, turn: true };
  return { x: road - lane * dir, y: nextY, turn: false };
}

function trafficControl(G, car, dt) {
  if (!car.route) car.route = pickRouteTarget(G, car);
  const d = dist(car.x, car.y, car.route.x, car.route.y);
  if (d < 46) {
    // At the intersection: mostly straight on, sometimes turn.
    if (Math.random() < 0.42) {
      const left = Math.random() < 0.5;
      car.angle += left ? -Math.PI / 2 : Math.PI / 2;
      // Re-aim the velocity along the new heading so the turn looks driven.
      const sp = Math.hypot(car.vx, car.vy) * 0.6;
      car.vx = Math.cos(car.angle) * sp;
      car.vy = Math.sin(car.angle) * sp;
    }
    car.route = pickRouteTarget(G, car);
  }
  const desired = Math.atan2(car.route.y - car.y, car.route.x - car.x);
  const steer = clamp(angleDiff(car.angle, desired) * 2.4, -1, 1);
  const fSpeed = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);

  // Brake for the car ahead (player or traffic) inside the forward cone.
  let brake = 0;
  for (const other of G.cars) {
    if (other === car || other.wrecked) continue;
    const od = dist(car.x, car.y, other.x, other.y);
    if (od > 95) continue;
    const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
    if (ahead > 0 && ahead < 95) { brake = 1; break; }
  }
  const throttle = brake ? 0 : (fSpeed < car.cruise ? 0.6 : 0);
  return { throttle, brake, steer, handbrake: false };
}

export function spawnTraffic(G, n) {
  const rng = new Rng((G.seed ^ 0x9e3779b9) >>> 0);
  const models = ['sedan', 'sedan', 'taxi', 'van', 'pickup'];
  for (let k = 0; k < n; k++) {
    const p = randomRoadPoint(G.city, rng, G.player.x, G.player.y, 300, 1200);
    const car = makeCar(rng.pick(models), p.x, p.y, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), {
      traffic: true, driver: 'traffic',
    });
    car.route = pickRouteTarget(G, car);
    G.cars.push(car);
  }
}

export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (!car.traffic || car.wrecked) continue;
    // Recycle far-away traffic near the player so streets never feel empty.
    if (dist(car.x, car.y, G.player.x, G.player.y) > 1500) {
      const p = randomRoadPoint(G.city, G.rng, G.player.x, G.player.y, 500, 1000);
      car.x = p.x;
      car.y = p.y;
      car.vx = 0;
      car.vy = 0;
      car.angle = Math.floor(Math.random() * 4) * (Math.PI / 2);
      car.route = null;
    }
    updateCarPhysics(car, trafficControl(G, car, dt), dt, G);
  }
}

// Every car that is not driven or traffic still rolls, slows and smokes.
export function updateCoastingCars(G, dt) {
  for (const car of G.cars) {
    if (car.driver === 'player' || car.traffic) continue;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 4 && !car.wrecked) {
      car.vx = 0;
      car.vy = 0;
      car.parked = true;
      continue;
    }
    updateCarPhysics(car, { throttle: 0, brake: 0, steer: 0, handbrake: false }, dt, G);
  }
  // Wrecks keep smoking for a while.
  for (const car of G.cars) {
    if (!car.wrecked) continue;
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = 0.12;
      G.effects.smoke(car.x, car.y - 6);
    }
  }
}

export function resolveCarCollisions(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = 21 + 21;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (rr - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impulse = -rel * 0.55;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        if (-rel > 160) {
          damageCar(G, a, 4);
          damageCar(G, b, 4);
          G.effects.sparks((a.x + b.x) / 2, (a.y + b.y) / 2);
          if (a.driver === 'player' || b.driver === 'player') {
            G.sfx.crash(0.7);
            G.effects.shake(5);
          }
        }
      }
    }
  }
}

export function damageCar(G, car, amount) {
  if (car.wrecked) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.wrecked = true;
    car.vx *= 0.2;
    car.vy *= 0.2;
    G.effects.burst(car.x, car.y, 22, '#ff8a3a', 260, 0.6, 4);
    G.effects.burst(car.x, car.y, 12, '#3a3a3a', 120, 1.1, 6);
    if (car.police) car.needsCop = true;
    if (car.driver === 'player') {
      // The player's ride just died: throw him out on foot.
      exitCar(G, true);
    }
  } else if (car.hp < 45 && Math.random() < 0.25) {
    G.effects.smoke(car.x + Math.cos(car.angle) * 14, car.y + Math.sin(car.angle) * 14);
  }
}

export function nearestCar(G, x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of G.cars) {
    if (car.wrecked || car.driver === 'player') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function stealCar(G, car) {
  if (car.wrecked || car.driver === 'player') return false;
  car.driver = 'player';
  car.parked = false;
  car.traffic = false;
  car.route = null;
  G.player.car = car;
  G.player.onFoot = false;
  G.player.x = car.x;
  G.player.y = car.y;
  G.stats.stolen++;
  return true;
}

export function exitCar(G, forced = false) {
  const car = G.player.car;
  if (!car) return;
  const side = 30;
  const px = -Math.sin(car.angle);
  const py = Math.cos(car.angle);
  let ex = car.x + px * side;
  let ey = car.y + py * side;
  const res = collideCircle(G.city, ex, ey, 13);
  ex = res.x;
  ey = res.y;
  G.player.x = ex;
  G.player.y = ey;
  G.player.vx = 0;
  G.player.vy = 0;
  G.player.onFoot = true;
  G.player.car = null;
  car.driver = null;
  if (forced) car.parked = true;
}
