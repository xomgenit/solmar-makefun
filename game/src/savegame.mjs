// savegame.mjs — SOLMAR saves to localStorage. The city seed is stored, so
// CONTINUE rebuilds the exact same city; the mission restarts at its first
// stage, which keeps every save loadable even mid-mission.
import { SAVE_KEY } from './config.mjs';

export function saveGame(G) {
  try {
    const p = G.player;
    const data = {
      v: 1,
      seed: G.seed,
      missionIndex: G.mission.index,
      cash: p.cash,
      hp: p.hp,
      px: Math.round(p.x),
      py: Math.round(p.y),
      angle: p.angle,
      inCar: !p.onFoot && !!p.car,
      carModel: p.car ? p.car.model : null,
      carColor: p.car ? p.car.color : null,
      carHp: p.car ? Math.round(p.car.hp) : null,
      stashesTaken: G.stashes.map((s) => !!s.taken),
      sportsUnlocked: G.sportsUnlocked,
      stats: G.stats,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.seed !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* storage unavailable */ }
}
