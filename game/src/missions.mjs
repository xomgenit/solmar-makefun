// missions.mjs — Vera Santos's five-job story arc for Danny "Dice" Marlow,
// plus free roam after the score. Each mission is a small stage machine;
// completing one pays out, autosaves, then hands the next job over.
import { dist } from './util.mjs';
import { MISSION_REWARDS, MISSION_NAMES } from './config.mjs';
import { spawnEnemySquad, enemiesLeft } from './combat.mjs';
import { makeCar } from './vehicles.mjs';
import { saveGame } from './savegame.mjs';

const BRIEFINGS = [
  "Vera: 'New in town, Dice? Get wheels first. Any car. Don't get caught.'",
  "Vera: 'A package waits at the Docks. Bring it to Ray's Garage. No questions.'",
  "Vera: 'Hot delivery — the Pier, 90 seconds. Drive like the sun is chasing you.'",
  "Vera: 'The Harbor Kings jumped my crew at the Pier. End it. All four of them.'",
  "Vera: 'The big one, Dice. Crack the bank vault, then lose the heat at the Hideout.'",
];

export function isFreeRoam(G) {
  return G.mission.index >= 5;
}

function setMarker(G, landmarkId) {
  const lm = G.city.landmarks[landmarkId];
  G.mission.marker = lm ? { x: lm.doorX, y: lm.doorY } : null;
}

function showBanner(G, title, sub, dur = 3.2) {
  G.banner = { title, sub, t: 0, dur };
}

export function startMission(G, i) {
  const m = G.mission;
  m.index = i;
  m.stage = 0;
  m.timer = 0;
  m.channel = 0;
  m.channelAnchor = null;
  m.pendingNext = 0;
  m.data = {};
  showBanner(G, MISSION_NAMES[i], BRIEFINGS[i], 4);
  G.sfx.pickup();
  if (i === 0) {
    m.objective = 'Steal a car — press E next to one';
    m.marker = null;
  } else if (i === 1) {
    m.objective = 'Go to the Docks';
    setMarker(G, 'docks');
  } else if (i === 2) {
    m.objective = 'Deliver to the Pier — fast!';
    m.timer = 90;
    setMarker(G, 'pier');
  } else if (i === 3) {
    m.objective = 'Go to the Pier';
    setMarker(G, 'pier');
  } else if (i === 4) {
    m.objective = 'Go to Solmar National Bank';
    setMarker(G, 'bank');
  }
}

// Restart the current mission from its first stage (pause menu / failure).
export function resetMission(G) {
  G.enemies = [];
  G.mission.pendingNext = 0;
  startMission(G, Math.min(G.mission.index, 4));
}

export function completeMission(G) {
  const m = G.mission;
  const i = m.index;
  const reward = MISSION_REWARDS[i];
  // Clear and advance the state FIRST, before any effect runs: if an effect
  // threw, a half-completed mission must never pay out again next frame.
  m.index = i + 1;
  m.stage = 0;
  m.marker = null;
  m.objective = '';
  m.timer = 0;
  m.channel = 0;
  G.player.cash += reward;
  G.stats.cashEarned += reward;
  G.stats.missionsDone++;
  if (i === 2 && !G.sportsUnlocked) {
    G.sportsUnlocked = true;
    const hideout = G.city.landmarks.hideout;
    G.cars.push(makeCar('sports', hideout.doorX + 60, hideout.doorY + 10, 0, {
      parked: true, color: '#e82e2e',
    }));
  }
  showBanner(G, 'MISSION PASSED', `+$${reward.toLocaleString('en-US')}`, 3);
  G.effects.floater(G.player.x, G.player.y - 34, `+$${reward}`, '#7ae8a0', 22);
  G.sfx.jingle();
  saveGame(G);
  if (m.index >= 5) {
    m.objective = 'FREE ROAM — Solmar Bay is yours';
    m.pendingNext = 0;
    showBanner(G, 'THE SOLMAR SCORE', 'Every job done. The city is yours, Dice.', 5);
  } else {
    // Let the PASSED banner breathe before the next briefing lands.
    m.pendingNext = 3.2;
  }
}

function failMission(G, reason) {
  showBanner(G, 'MISSION FAILED', reason, 3);
  G.sfx.sting();
  G.enemies = [];
  startMission(G, G.mission.index);
}

export function updateMissions(G, dt) {
  const m = G.mission;
  const p = G.player;
  if (m.pendingNext > 0) {
    m.pendingNext -= dt;
    if (m.pendingNext <= 0) startMission(G, m.index);
    return;
  }
  if (isFreeRoam(G)) return;

  const lm = G.city.landmarks;
  if (m.index === 0) {
    if (m.stage === 0) {
      m.objective = 'Steal a car — press E next to one';
      if (!p.onFoot) {
        m.stage = 1;
        m.objective = "Drive to Ray's Garage";
        setMarker(G, 'garage');
        G.sfx.pickup();
      }
    } else if (dist(p.x, p.y, lm.garage.doorX, lm.garage.doorY) < 110) {
      completeMission(G);
    }
  } else if (m.index === 1) {
    if (m.stage === 0) {
      if (dist(p.x, p.y, lm.docks.doorX, lm.docks.doorY) < 100) {
        m.stage = 1;
        m.objective = "Press E to grab Vera's package";
        G.sfx.pickup();
      }
    } else if (m.stage === 2) {
      m.objective = "Deliver the package to Ray's Garage";
      if (dist(p.x, p.y, lm.garage.doorX, lm.garage.doorY) < 110) completeMission(G);
    }
  } else if (m.index === 2) {
    m.timer -= dt;
    const secs = Math.max(0, Math.ceil(m.timer));
    m.objective = `Deliver to the Pier — ${secs}s left!`;
    if (m.timer <= 10 && m.timer > 0 && Math.ceil(m.timer) !== Math.ceil(m.timer + dt)) {
      G.sfx.tick();
    }
    if (m.timer <= 0) {
      failMission(G, 'Too slow — the buyer walked away.');
    } else if (dist(p.x, p.y, lm.pier.doorX, lm.pier.doorY) < 110) {
      completeMission(G);
    }
  } else if (m.index === 3) {
    if (m.stage === 0) {
      if (dist(p.x, p.y, lm.pier.doorX, lm.pier.doorY) < 140) {
        m.stage = 1;
        spawnEnemySquad(G, lm.pier.x, lm.pier.y - 60, 4);
        G.sfx.sting();
        showBanner(G, 'PAYBACK AT THE PIER', 'Four Harbor Kings. No witnesses.', 3);
      }
    } else {
      const left = enemiesLeft(G);
      m.objective = `Eliminate the Harbor Kings (${left} left)`;
      m.marker = null;
      if (left === 0) completeMission(G);
    }
  } else if (m.index === 4) {
    if (m.stage === 0) {
      if (dist(p.x, p.y, lm.bank.doorX, lm.bank.doorY) < 100) {
        m.stage = 1;
        m.objective = 'Hold E to crack the vault';
        m.channel = 0;
        G.sfx.pickup();
      }
    } else if (m.stage === 1) {
      const near = dist(p.x, p.y, lm.bank.doorX, lm.bank.doorY) < 110;
      const holding = G.input.down('KeyE') && p.onFoot;
      if (near && holding) {
        if (!m.channelAnchor) m.channelAnchor = { x: p.x, y: p.y };
        if (dist(p.x, p.y, m.channelAnchor.x, m.channelAnchor.y) > 55) {
          m.channel = Math.max(0, m.channel - dt * 2);
        } else {
          m.channel += dt;
          if (Math.random() < dt * 6) G.sfx.tick();
        }
      } else {
        m.channel = Math.max(0, m.channel - dt * 2);
        m.channelAnchor = null;
      }
      m.objective = 'Hold E to crack the vault';
      if (m.channel >= 8) {
        m.stage = 2;
        m.channel = 0;
        G.wanted = 3;
        G.wantedFlash = 1;
        m.objective = 'Escape to the Hideout — lose the heat!';
        setMarker(G, 'hideout');
        showBanner(G, 'THE VAULT IS OPEN', 'Three stars. Run, Dice!', 3.5);
        G.sfx.sting();
      }
    } else if (m.stage === 2) {
      if (dist(p.x, p.y, lm.hideout.doorX, lm.hideout.doorY) < 110) {
        completeMission(G);
      }
    }
  }
}

// E-press interactions owned by missions (package pickup). Returns handled.
export function missionInteract(G) {
  const m = G.mission;
  if (m.index === 1 && m.stage === 1) {
    const lm = G.city.landmarks.docks;
    if (dist(G.player.x, G.player.y, lm.doorX, lm.doorY) < 90) {
      m.stage = 2;
      m.objective = "Deliver the package to Ray's Garage";
      setMarker(G, 'garage');
      G.effects.floater(G.player.x, G.player.y - 30, 'PACKAGE SECURED', '#ffd94d', 18);
      G.sfx.pickup();
      return true;
    }
  }
  return false;
}
