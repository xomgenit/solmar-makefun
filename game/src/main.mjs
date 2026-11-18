// main.mjs — SOLMAR's entry point: game state, the loop, screens (title /
// pause / wasted / busted), player control, interactions and the camera.
// Every system reads the one shared state object G, so nothing is wired
// through long parameter lists and nothing can be forgotten.
import { clamp, dist, angleLerp, Rng } from './util.mjs';
import { WORLD_W, WORLD_H, VIEW_W, VIEW_H, WALK_SPEED, SPRINT_SPEED, STASH_VALUE } from './config.mjs';
import { buildCity, zoneAt, collideCircle } from './city.mjs';
import { Input } from './input.mjs';
import { Sfx } from './audio.mjs';
import { Effects } from './effects.mjs';
import {
  spawnParkedCars, spawnTraffic, updateTraffic, updateCoastingCars,
  resolveCarCollisions, updateCarPhysics, nearestCar, stealCar, exitCar,
  makeCar,
} from './vehicles.mjs';
import { spawnPeds, updatePeds, updateCops, knockPed } from './people.mjs';
import { updatePolice, addWanted, witnessesNear, tryRespray } from './police.mjs';
import { playerShoot, updateEnemies } from './combat.mjs';
import { startMission, updateMissions, missionInteract, resetMission, isFreeRoam } from './missions.mjs';
import { drawWorld } from './render.mjs';
import { drawHUD } from './hud.mjs';
import { saveGame, loadSave, hasSave } from './savegame.mjs';

let G = null; // the live game state; the debug hook reads it through a getter
let canvas = null;
let ctx = null;
let input = null;
let sfx = null;
let effects = null;
let lastTime = 0;

function createState(seed, demo = false) {
  const rng = new Rng(seed);
  const city = buildCity(seed);
  const hideout = city.landmarks.hideout;
  const state = {
    seed, rng, city, demo,
    time: 0, screen: 'title',
    player: {
      x: hideout.doorX, y: hideout.doorY + 40, angle: -Math.PI / 2,
      vx: 0, vy: 0, hp: 100, maxHp: 100, cash: 0,
      onFoot: true, car: null, aimAngle: 0, shootCd: 0, invuln: 0, walkPhase: 0,
    },
    cars: [], peds: [], cops: [], enemies: [],
    wanted: 0, wantedQuiet: 0, wantedFlash: 0, spawnTimer: 0,
    mission: {
      index: -1, stage: 0, timer: 0, channel: 0, channelAnchor: null,
      pendingNext: 0, data: {}, objective: '', marker: null,
    },
    stats: { stolen: 0, kills: 0, shots: 0, missionsDone: 0, deaths: 0, busted: 0, cashEarned: 0 },
    stashes: [
      { x: 1300, y: 1040, taken: false },
      { x: 2600, y: 3640, taken: false },
      { x: 4420, y: 1300, taken: false },
    ],
    sportsUnlocked: false,
    effects, sfx, input,
    camera: { x: hideout.doorX, y: hideout.doorY },
    banner: null, zone: zoneAt(hideout.doorX, hideout.doorY), zoneToast: null,
    hint: null, flash: 0, pendingEnd: null, endTimer: 0, lastShot: null,
    shotHeatCd: 0,
  };
  state.cars.push(...spawnParkedCars(city, rng, 26));
  G = state; // spawnTraffic / spawnPeds read the live state
  spawnTraffic(state, 14);
  spawnPeds(state, 42);
  return state;
}

function mouseWorld() {
  return {
    x: input.mouse.x + G.camera.x - VIEW_W / 2,
    y: input.mouse.y + G.camera.y - VIEW_H / 2,
  };
}

function updatePlayerOnFoot(dt) {
  const p = G.player;
  const axis = input.moveAxis();
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
  p.vx = axis.x * speed;
  p.vy = axis.y * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const moving = axis.x !== 0 || axis.y !== 0;
  if (moving) p.walkPhase += dt * 11;
  const mw = mouseWorld();
  p.aimAngle = Math.atan2(mw.y - p.y, mw.x - p.x);
  // Face the mouse while aiming, the road while running.
  if (input.mouse.down) p.angle = p.aimAngle;
  else if (moving) p.angle = angleLerp(p.angle, Math.atan2(axis.y, axis.x), Math.min(1, 12 * dt));
  const res = collideCircle(G.city, p.x, p.y, 13);
  p.x = res.x;
  p.y = res.y;
  // Cars are solid: step out of any car the player walks into.
  for (const car of G.cars) {
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < 24 && d > 0.01) {
      p.x = car.x + ((p.x - car.x) / d) * 24;
      p.y = car.y + ((p.y - car.y) / d) * 24;
    }
  }
  p.shootCd = Math.max(0, p.shootCd - dt);
  if (input.mouse.down) {
    playerShoot(G);
    // A gunshot in front of witnesses brings the heat (5s cooldown).
    if (G.shotHeatCd <= 0 && witnessesNear(G, p.x, p.y, 420)) {
      addWanted(G, 1);
      G.shotHeatCd = 5;
    }
  }
}

function updatePlayerInCar(dt) {
  const p = G.player;
  const car = p.car;
  const ctrl = {
    throttle: (input.down('KeyW') || input.down('ArrowUp')) ? 1 : 0,
    brake: (input.down('KeyS') || input.down('ArrowDown')) ? 1 : 0,
    steer: ((input.down('KeyA') || input.down('ArrowLeft')) ? -1 : 0)
      + ((input.down('KeyD') || input.down('ArrowRight')) ? 1 : 0),
    handbrake: input.down('Space'),
  };
  updateCarPhysics(car, ctrl, dt, G);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.vx = car.vx;
  p.vy = car.vy;
  const speed01 = clamp(Math.hypot(car.vx, car.vy) / car.topSpeed, 0, 1);
  sfx.setEngine(true, speed01);
  if (input.pressed('KeyH')) sfx.honk();
  // Running people over: witnesses turn it into heat.
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 24 && Math.hypot(car.vx, car.vy) > 60) {
      knockPed(G, ped, car.vx, car.vy);
      if (!ped.counted) {
        ped.counted = true;
        if (witnessesNear(G, ped.x, ped.y, 500)) addWanted(G, 1);
      }
      sfx.crash(0.4);
    }
  }
  for (const cop of G.cops) {
    if (cop.dead) continue;
    if (dist(car.x, car.y, cop.x, cop.y) < 24 && Math.hypot(car.vx, car.vy) > 80) {
      cop.dead = true;
      cop.hp = 0;
      G.stats.kills++;
      addWanted(G, 1);
      G.effects.burst(cop.x, cop.y, 14, '#ff5a4a', 160, 0.5, 3);
    }
  }
}

function nearestStash() {
  for (const s of G.stashes) {
    if (!s.taken && dist(G.player.x, G.player.y, s.x, s.y) < 46) return s;
  }
  return null;
}

function computeHint() {
  const p = G.player;
  if (p.onFoot) {
    const m = G.mission;
    if (m.index === 1 && m.stage === 1) {
      const d = G.city.landmarks.docks;
      if (dist(p.x, p.y, d.doorX, d.doorY) < 90) return 'E — Grab the package';
    }
    if (m.index === 4 && m.stage === 1) {
      const b = G.city.landmarks.bank;
      if (dist(p.x, p.y, b.doorX, b.doorY) < 110) return 'Hold E — Crack the vault';
    }
    if (nearestStash()) return `E — Collect hidden stash $${STASH_VALUE}`;
    const car = nearestCar(G, p.x, p.y, 52);
    if (car) return `E — Steal the ${car.label}`;
    return null;
  }
  const spa = G.city.landmarks.spa;
  if (dist(p.x, p.y, spa.doorX, spa.doorY) < 130 && p.car
    && (G.wanted > 0 || p.car.hp < p.car.maxHp)) {
    return 'E — Respray $150 (clears wanted + repairs)';
  }
  return 'E — Get out of the car';
}

function handleInteract() {
  const p = G.player;
  if (!p.onFoot) {
    if (!tryRespray(G)) exitCar(G);
    return;
  }
  if (missionInteract(G)) return;
  const stash = nearestStash();
  if (stash) {
    stash.taken = true;
    p.cash += STASH_VALUE;
    G.stats.cashEarned += STASH_VALUE;
    G.effects.floater(p.x, p.y - 30, `+$${STASH_VALUE} STASH`, '#7ae8a0', 18);
    sfx.pickup();
    saveGame(G);
    return;
  }
  const car = nearestCar(G, p.x, p.y, 52);
  if (car && stealCar(G, car)) {
    sfx.honk();
    if (witnessesNear(G, car.x, car.y, 450)) addWanted(G, 1);
  }
}

function updateCamera(dt) {
  const p = G.player;
  const look = p.onFoot ? 0.12 : 0.3;
  const tx = p.x + p.vx * look;
  const ty = p.y + p.vy * look;
  const k = 1 - Math.exp(-5 * dt);
  G.camera.x = clamp(
    G.camera.x + (tx - G.camera.x) * k, VIEW_W / 2, WORLD_W - VIEW_W / 2,
  );
  G.camera.y = clamp(
    G.camera.y + (ty - G.camera.y) * k, VIEW_H / 2, WORLD_H - VIEW_H / 2,
  );
}

function updatePlay(dt) {
  G.time += dt;
  const p = G.player;
  p.invuln = Math.max(0, p.invuln - dt);
  G.shotHeatCd = Math.max(0, G.shotHeatCd - dt);
  G.flash = Math.max(0, G.flash - dt * 1.6);
  if (input.pressed('Escape') || input.pressed('KeyP')) { pauseGame(); return; }
  if (input.pressed('KeyM')) sfx.toggleMute();
  if (input.pressed('KeyE')) handleInteract();

  if (p.onFoot) {
    updatePlayerOnFoot(dt);
    sfx.setEngine(false, 0);
  } else {
    updatePlayerInCar(dt);
  }
  updateTraffic(G, dt);
  updateCoastingCars(G, dt);
  resolveCarCollisions(G);
  updatePeds(G, dt);
  updateCops(G, dt);
  updatePolice(G, dt);
  updateEnemies(G, dt);
  updateMissions(G, dt);
  effects.update(dt);
  sfx.update(dt);

  if (G.banner) {
    G.banner.t += dt;
    if (G.banner.t >= G.banner.dur) G.banner = null;
  }
  const zone = zoneAt(p.x, p.y);
  if (zone !== G.zone) {
    G.zone = zone;
    G.zoneToast = { name: zone, t: 2.2 };
  }
  if (G.zoneToast) {
    G.zoneToast.t -= dt;
    if (G.zoneToast.t <= 0) G.zoneToast = null;
  }
  G.hint = computeHint();
  updateCamera(dt);

  if (G.pendingEnd) {
    const kind = G.pendingEnd;
    G.pendingEnd = null;
    endGame(kind);
  }
}

function updateDemo(dt) {
  // The title screen's living backdrop: traffic flows, peds stroll, and the
  // camera drifts over downtown. No missions, no police, no player.
  G.time += dt;
  updateTraffic(G, dt);
  updateCoastingCars(G, dt);
  resolveCarCollisions(G);
  updatePeds(G, dt);
  effects.update(dt);
  const t = G.time * 0.05;
  const cx = 2600 + Math.cos(t) * 900;
  const cy = 1700 + Math.sin(t * 0.7) * 600;
  G.camera.x = clamp(cx, VIEW_W / 2, WORLD_W - VIEW_W / 2);
  G.camera.y = clamp(cy, VIEW_H / 2, WORLD_H - VIEW_H / 2);
}

function endGame(kind) {
  G.screen = kind;
  G.endTimer = 3.2;
  sfx.setEngine(false, 0);
  sfx.setSiren(false);
  sfx.sting();
  if (kind === 'wasted') G.stats.deaths++;
  else G.stats.busted++;
  const overlay = document.getElementById('end-screen');
  const title = document.getElementById('end-title');
  const sub = document.getElementById('end-sub');
  title.textContent = kind === 'wasted' ? 'WASTED' : 'BUSTED';
  title.style.color = kind === 'wasted' ? '#ff4a3a' : '#4a9ae8';
  sub.textContent = kind === 'wasted'
    ? 'The sun sets on Dice… for now. You wake up at Solmar General.'
    : 'The SBPD has you. You walk out of HQ with a fine and a warning.';
  overlay.classList.remove('hidden');
}

function respawn() {
  const p = G.player;
  const penalty = Math.floor(p.cash * 0.1);
  p.cash -= penalty;
  p.hp = p.maxHp;
  p.invuln = 3;
  G.wanted = 0;
  G.wantedQuiet = 0;
  G.cops = [];
  G.enemies = [];
  G.cars = G.cars.filter((c) => !c.police);
  const spot = G.screen === 'wasted'
    ? G.city.landmarks.hospital : G.city.landmarks.sbpd;
  p.x = spot.doorX;
  p.y = spot.doorY + 30;
  p.vx = 0;
  p.vy = 0;
  p.onFoot = true;
  p.car = null;
  G.camera.x = p.x;
  G.camera.y = p.y;
  if (!isFreeRoam(G) && G.mission.index >= 0) resetMission(G);
  G.flash = 0;
  document.getElementById('end-screen').classList.add('hidden');
  G.screen = 'play';
}

function showOverlay(id, show) {
  document.getElementById(id).classList.toggle('hidden', !show);
}

function newGame() {
  sfx.ensure();
  const seed = (Math.random() * 1e9) | 0;
  createState(seed);
  G.screen = 'play';
  showOverlay('title-screen', false);
  showOverlay('pause-menu', false);
  showOverlay('howto-panel', false);
  startMission(G, 0);
}

function continueGame() {
  sfx.ensure();
  const save = loadSave();
  if (!save) return;
  createState(save.seed);
  const p = G.player;
  p.x = save.px;
  p.y = save.py;
  p.angle = save.angle || 0;
  p.cash = save.cash || 0;
  p.hp = save.hp ?? 100;
  G.camera.x = p.x;
  G.camera.y = p.y;
  G.stashes.forEach((s, i) => { s.taken = !!(save.stashesTaken && save.stashesTaken[i]); });
  G.sportsUnlocked = !!save.sportsUnlocked;
  if (save.stats) G.stats = { ...G.stats, ...save.stats };
  if (save.inCar && save.carModel) {
    const car = makeCar(save.carModel, p.x + 30, p.y, p.angle, { color: save.carColor || undefined });
    if (save.carHp) car.hp = save.carHp;
    G.cars.push(car);
    stealCar(G, car);
    G.stats.stolen--; // loading a save is not a fresh theft
  }
  G.screen = 'play';
  showOverlay('title-screen', false);
  showOverlay('pause-menu', false);
  if (save.missionIndex >= 5) {
    G.mission.index = 5;
    G.mission.objective = 'FREE ROAM — Solmar Bay is yours';
  } else {
    startMission(G, Math.max(0, save.missionIndex));
  }
}

function pauseGame() {
  if (G.screen !== 'play') return;
  G.screen = 'pause';
  sfx.setEngine(false, 0);
  const stats = document.getElementById('pause-stats');
  stats.textContent = `Missions done: ${G.stats.missionsDone} · Cash earned: $${G.stats.cashEarned.toLocaleString('en-US')} · Cars stolen: ${G.stats.stolen} · Takedowns: ${G.stats.kills}`;
  showOverlay('pause-menu', true);
}

function resumeGame() {
  if (G.screen !== 'pause') return;
  G.screen = 'play';
  showOverlay('pause-menu', false);
}

function quitToTitle() {
  showOverlay('pause-menu', false);
  showOverlay('howto-panel', false);
  showOverlay('end-screen', false);
  document.getElementById('continue-btn').disabled = !hasSave();
  showOverlay('title-screen', true);
  G.screen = 'title';
  G.demo = true;
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (G.screen === 'title') {
    updateDemo(dt);
    drawWorld(ctx, G);
  } else if (G.screen === 'play') {
    updatePlay(dt);
    drawWorld(ctx, G);
    drawHUD(ctx, G);
  } else if (G.screen === 'pause') {
    if (input.pressed('Escape') || input.pressed('KeyP')) resumeGame();
    drawWorld(ctx, G);
    drawHUD(ctx, G);
  } else if (G.screen === 'wasted' || G.screen === 'busted') {
    G.endTimer -= dt;
    effects.update(dt);
    drawWorld(ctx, G);
    drawHUD(ctx, G);
    if (G.endTimer <= 0) respawn();
  }
  input.endFrame();
  window.__solmarReady = true;
  requestAnimationFrame(frame);
}

function wireUI() {
  document.getElementById('new-game-btn').addEventListener('click', newGame);
  document.getElementById('continue-btn').addEventListener('click', continueGame);
  document.getElementById('howto-btn').addEventListener('click', () => {
    sfx.ensure();
    showOverlay('howto-panel', true);
  });
  document.getElementById('howto-close').addEventListener('click', () => showOverlay('howto-panel', false));
  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('save-btn').addEventListener('click', () => {
    if (saveGame(G)) {
      const b = document.getElementById('save-btn');
      b.textContent = 'SAVED ✓';
      setTimeout(() => { b.textContent = 'SAVE GAME'; }, 1500);
    }
  });
  document.getElementById('restart-mission-btn').addEventListener('click', () => {
    if (!isFreeRoam(G) && G.mission.index >= 0) resetMission(G);
    resumeGame();
  });
  document.getElementById('quit-btn').addEventListener('click', quitToTitle);
  document.getElementById('end-respawn-btn').addEventListener('click', respawn);
  document.getElementById('continue-btn').disabled = !hasSave();
  // First gesture unlocks audio anywhere on the page.
  window.addEventListener('pointerdown', () => sfx.ensure(), { once: true });
  window.addEventListener('keydown', () => sfx.ensure(), { once: true });
}

function installDebugHook() {
  window.__solmarErrors = [];
  window.addEventListener('error', (e) => window.__solmarErrors.push(String(e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => window.__solmarErrors.push(`rejection: ${e.reason}`));
  // Dev hook for play-testing and screenshots: state setup only, the game
  // itself renders every frame. Nothing here changes how the game plays.
  const hook = {
    get game() { return G; },
    state() {
      const p = G.player;
      return {
        screen: G.screen, time: Math.round(G.time * 10) / 10,
        mission: G.mission.index, stage: G.mission.stage,
        objective: G.mission.objective, cash: p.cash, hp: Math.round(p.hp),
        wanted: G.wanted, x: Math.round(p.x), y: Math.round(p.y),
        onFoot: p.onFoot, car: p.car ? p.car.model : null,
        speed: Math.round(p.car ? Math.hypot(p.car.vx, p.car.vy) : Math.hypot(p.vx, p.vy)),
        cops: G.cops.length, cruisers: G.cars.filter((c) => c.police && !c.wrecked).length,
        enemies: G.enemies.length, zone: G.zone, seed: G.seed,
        cars: G.cars.length, peds: G.peds.length,
      };
    },
    debug: {
      teleport(x, y) {
        const p = G.player;
        p.x = x; p.y = y;
        if (p.car) { p.car.x = x; p.car.y = y; p.car.vx = 0; p.car.vy = 0; }
        G.camera.x = x; G.camera.y = y;
      },
      giveCar(model = 'sports') {
        const p = G.player;
        const car = makeCar(model, p.x + 40, p.y, 0, { color: '#e82e2e' });
        G.cars.push(car);
        stealCar(G, car);
      },
      setWanted(n) { G.wanted = clamp(n, 0, 5); G.wantedQuiet = 0; },
      setMission(i) { startMission(G, i); },
      setCash(n) { G.player.cash = n; },
      heal() { G.player.hp = G.player.maxHp; },
      // Stage a police chase for the cover screenshot: mission 3's timed
      // run with a hot wanted level, cruisers already closing in.
      spawnChase() {
        this.setMission(2);
        this.giveCar('sports');
        this.setWanted(3);
        G.player.cash = 1050;
        const p = G.player;
        for (let k = 0; k < 3; k++) {
          const c = makeCar('cruiser', p.x - 120 - k * 90, p.y + (k - 1) * 60, p.angle, { driver: 'police' });
          c.vx = 300; c.vy = 0;
          G.cars.push(c);
        }
      },
    },
  };
  Object.defineProperty(window, '__solmar', { value: hook, configurable: true });
}

export function boot() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  input = new Input(canvas);
  sfx = new Sfx();
  effects = new Effects();
  createState(7, true); // attract-mode city behind the title screen
  G.screen = 'title';
  wireUI();
  installDebugHook();
  requestAnimationFrame(frame);
}

boot();
