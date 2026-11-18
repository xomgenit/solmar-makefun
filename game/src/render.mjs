// render.mjs — draws Solmar Bay: sun-soaked streets, pastel rooftops,
// palms, beach and sea, then every car, person and effect on top of them.
// Only what the camera sees is drawn, so the frame stays fast.
import { clamp } from './util.mjs';
import {
  VIEW_W, VIEW_H, WORLD_W, WORLD_H, ROAD_W, ROAD_GAP, ROAD_FIRST,
  BEACH_Y, SEA_Y, PALETTE,
} from './config.mjs';

const ROAD_HALF = ROAD_W / 2;

function inView(G, x, y, m = 120) {
  const c = G.camera;
  return x > c.x - VIEW_W / 2 - m && x < c.x + VIEW_W / 2 + m
    && y > c.y - VIEW_H / 2 - m && y < c.y + VIEW_H / 2 + m;
}

export function drawWorld(ctx, G) {
  const cam = G.camera;
  const shX = G.effects.shakeMag > 0 ? (Math.random() - 0.5) * G.effects.shakeMag : 0;
  const shY = G.effects.shakeMag > 0 ? (Math.random() - 0.5) * G.effects.shakeMag : 0;
  ctx.save();
  ctx.translate(VIEW_W / 2 - cam.x + shX, VIEW_H / 2 - cam.y + shY);

  drawGround(ctx, G);
  drawRoads(ctx, G);
  drawDocksAndPier(ctx, G);
  drawBuildings(ctx, G);
  drawPalms(ctx, G);
  drawMarkers(ctx, G);
  G.effects.drawGround(ctx);
  drawCars(ctx, G);
  drawPeople(ctx, G);
  drawPlayer(ctx, G);
  G.effects.drawAir(ctx);
  G.effects.drawFloaters(ctx);

  ctx.restore();
}

function drawGround(ctx, G) {
  const c = G.camera;
  const x0 = Math.max(0, c.x - VIEW_W / 2 - 40);
  const y0 = Math.max(0, c.y - VIEW_H / 2 - 40);
  const x1 = Math.min(WORLD_W, c.x + VIEW_W / 2 + 40);
  const y1 = Math.min(WORLD_H, c.y + VIEW_H / 2 + 40);
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // City blocks get a checker of warm tones so the grid reads at a glance.
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 6; j++) {
      const bx = ROAD_FIRST + i * ROAD_GAP + ROAD_HALF + 8;
      const by = ROAD_FIRST + j * ROAD_GAP + ROAD_HALF + 8;
      const bw = ROAD_GAP - ROAD_W - 16;
      if (bx + bw < x0 || bx > x1 || by + bw < y0 || by > y1) continue;
      ctx.fillStyle = (i + j) % 2 === 0 ? PALETTE.groundAlt : PALETTE.ground;
      ctx.fillRect(bx, by, bw, bw);
    }
  }
  // Beach + sea along the south edge.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(x0, Math.max(y0, BEACH_Y), x1 - x0, Math.min(y1, SEA_Y) - Math.max(y0, BEACH_Y));
  ctx.fillStyle = PALETTE.sea;
  ctx.fillRect(x0, Math.max(y0, SEA_Y), x1 - x0, y1 - Math.max(y0, SEA_Y));
  // Animated wave lines where the water meets the sand.
  if (y1 > SEA_Y) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    for (let w = 0; w < 3; w++) {
      const wy = SEA_Y + 18 + w * 26 + Math.sin(G.time * 1.4 + w * 2) * 4;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 60) {
        const yy = wy + Math.sin(x / 90 + w + G.time) * 4;
        if (x === x0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }
}

function drawRoads(ctx, G) {
  const c = G.camera;
  const x0 = c.x - VIEW_W / 2 - 80;
  const x1 = c.x + VIEW_W / 2 + 80;
  const y0 = c.y - VIEW_H / 2 - 80;
  const y1 = c.y + VIEW_H / 2 + 80;
  // Sidewalks first (wider, pale), then asphalt, then markings.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of G.city.roadsV) {
    if (rx < x0 || rx > x1) continue;
    ctx.fillRect(rx - ROAD_HALF - 22, Math.max(0, y0), ROAD_W + 44, Math.min(3520, y1) - Math.max(0, y0));
  }
  for (const ry of G.city.roadsH) {
    if (ry < y0 || ry > y1) continue;
    ctx.fillRect(Math.max(0, x0), ry - ROAD_HALF - 22, Math.min(WORLD_W, x1) - Math.max(0, x0), ROAD_W + 44);
  }
  ctx.fillStyle = PALETTE.asphalt;
  for (const rx of G.city.roadsV) {
    if (rx < x0 || rx > x1) continue;
    ctx.fillRect(rx - ROAD_HALF, Math.max(0, y0), ROAD_W, Math.min(3520, y1) - Math.max(0, y0));
  }
  for (const ry of G.city.roadsH) {
    if (ry < y0 || ry > y1) continue;
    ctx.fillRect(Math.max(0, x0), ry - ROAD_HALF, Math.min(WORLD_W, x1) - Math.max(0, x0), ROAD_W);
  }
  // Centre dashes + crosswalks at intersections.
  ctx.fillStyle = PALETTE.centreLine;
  for (const rx of G.city.roadsV) {
    if (rx < x0 || rx > x1) continue;
    for (let y = 300; y < 3400; y += 64) {
      if (y < y0 || y > y1) continue;
      let inCross = false;
      for (const ry of G.city.roadsH) if (Math.abs(y - ry) < 90) { inCross = true; break; }
      if (!inCross) ctx.fillRect(rx - 2, y, 4, 30);
    }
  }
  for (const ry of G.city.roadsH) {
    if (ry < y0 || ry > y1) continue;
    for (let x = 300; x < 5100; x += 64) {
      if (x < x0 || x > x1) continue;
      let inCross = false;
      for (const rx of G.city.roadsV) if (Math.abs(x - rx) < 90) { inCross = true; break; }
      if (!inCross) ctx.fillRect(x, ry - 2, 30, 4);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const pt of G.city.intersections) {
    if (pt.x < x0 || pt.x > x1 || pt.y < y0 || pt.y > y1) continue;
    for (let k = -2; k <= 2; k++) {
      ctx.fillRect(pt.x + k * 18 - 5, pt.y - ROAD_HALF + 8, 10, 18);
      ctx.fillRect(pt.x + k * 18 - 5, pt.y + ROAD_HALF - 26, 10, 18);
    }
  }
}

function drawDocksAndPier(ctx, G) {
  // Docks platform on the east edge.
  ctx.fillStyle = '#b8b0a0';
  ctx.fillRect(4960, 2560, 210, 640);
  ctx.fillStyle = '#9a9284';
  ctx.fillRect(4960, 2560, 210, 12);
  ctx.fillStyle = '#8a8478';
  ctx.font = 'bold 15px Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SOLMAR DOCKS', 5065, 2590);
  // The pier: wooden deck reaching into the sea.
  ctx.fillStyle = PALETTE.pierWood;
  ctx.fillRect(2540, 3500, 120, 260);
  ctx.strokeStyle = '#8a6a44';
  ctx.lineWidth = 2;
  for (let y = 3510; y < 3760; y += 22) {
    ctx.beginPath();
    ctx.moveTo(2540, y);
    ctx.lineTo(2660, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(2534, 3748, 12, 14);
  ctx.fillRect(2654, 3748, 12, 14);
}

function drawBuildings(ctx, G) {
  for (const b of G.city.obstacles) {
    if (!inView(G, b.x + b.w / 2, b.y + b.h / 2, 80)) continue;
    // Soft sun shadow to the south-east.
    ctx.fillStyle = 'rgba(60,50,30,0.18)';
    ctx.fillRect(b.x + b.shadow, b.y + b.shadow, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof inset + rooftop detail (crates are too small for a roof).
    if (!b.crate) {
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 20, b.y + 20, b.w - 40, b.h - 40);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      if (b.detail === 0) {
        ctx.fillRect(b.x + 32, b.y + 32, 26, 18);
        ctx.fillRect(b.x + b.w - 64, b.y + b.h - 56, 30, 22);
      } else if (b.detail === 1) {
        for (let k = 0; k < 3; k++) ctx.fillRect(b.x + 30, b.y + 34 + k * 26, b.w - 60, 6);
      } else if (b.detail === 2) {
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (b.crate) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    }
    if (b.label) {
      ctx.font = 'bold 15px Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeText(b.label, b.x + b.w / 2, b.y - 12);
      ctx.fillStyle = '#33414f';
      ctx.fillText(b.label, b.x + b.w / 2, b.y - 12);
    }
  }
}

function drawPalms(ctx, G) {
  for (const palm of G.city.palms) {
    if (!inView(G, palm.x, palm.y, 40)) continue;
    const s = palm.s;
    ctx.strokeStyle = PALETTE.palmTrunk;
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 3 * s, palm.y - 12 * s);
    ctx.stroke();
    ctx.fillStyle = PALETTE.palmLeaf;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.ellipse(
        palm.x + Math.cos(a) * 10 * s, palm.y - 12 * s + Math.sin(a) * 7 * s,
        11 * s, 4.5 * s, a, 0, Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = '#7a5a2e';
    ctx.beginPath();
    ctx.arc(palm.x + 3 * s, palm.y - 10 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarkers(ctx, G) {
  // Hidden cash stashes glow green until collected.
  for (const s of G.stashes) {
    if (s.taken || !inView(G, s.x, s.y, 60)) continue;
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(122,232,160,0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e8a4a';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }
  // The package waiting at the docks in mission 2.
  if (G.mission.index === 1 && G.mission.stage === 1) {
    const d = G.city.landmarks.docks;
    const bob = Math.sin(G.time * 3) * 4;
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(d.doorX - 12, d.doorY - 12 + bob, 24, 24);
    ctx.strokeStyle = '#8a6a1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(d.doorX - 12, d.doorY - 12 + bob, 24, 24);
  }
  // Mission beacon: a pillar of light plus a pulsing ground diamond.
  const marker = G.mission.marker;
  if (marker && inView(G, marker.x, marker.y, 200)) {
    const grad = ctx.createLinearGradient(marker.x, marker.y - 190, marker.x, marker.y);
    grad.addColorStop(0, 'rgba(255,217,77,0)');
    grad.addColorStop(1, 'rgba(255,217,77,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(marker.x - 14, marker.y - 190, 28, 190);
    const pulse = 16 + Math.sin(G.time * 5) * 4;
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-pulse / 2, -pulse / 2, pulse, pulse);
    ctx.restore();
  }
}

function drawCarBody(ctx, car, time) {
  const w = car.len;
  const h = car.wid;
  // Shadow.
  ctx.fillStyle = 'rgba(40,30,15,0.25)';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 3, -h / 2 + 5, w, h, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.wrecked ? '#3a3a3a' : car.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 7);
  ctx.fill();
  // Cabin + windshield.
  ctx.fillStyle = car.wrecked ? '#222222' : '#bfe8f2';
  ctx.beginPath();
  ctx.roundRect(-w * 0.18, -h / 2 + 3, w * 0.3, h - 6, 4);
  ctx.fill();
  ctx.fillStyle = car.wrecked ? '#2a2a2a' : 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.roundRect(-w * 0.3, -h / 2 + 4, w * 0.12, h - 8, 3);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#1d1d1d';
  const wy = h / 2 - 1;
  ctx.fillRect(-w / 2 + 5, -wy - 2, 10, 4);
  ctx.fillRect(-w / 2 + 5, wy - 2, 10, 4);
  ctx.fillRect(w / 2 - 15, -wy - 2, 10, 4);
  ctx.fillRect(w / 2 - 15, wy - 2, 10, 4);
  // Headlights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(w / 2 - 3, -h / 2 + 3, 3, 5);
  ctx.fillRect(w / 2 - 3, h / 2 - 8, 3, 5);
  if (car.model === 'taxi') {
    ctx.fillStyle = '#fff3a0';
    ctx.fillRect(-6, -4, 12, 8);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 6px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
  }
  if (car.model === 'pickup') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w * 0.3, h - 6);
  }
  if (car.police) {
    // White doors + flashing light bar.
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-w * 0.08, -h / 2 + 2, w * 0.22, h - 4);
    const phase = Math.sin(car.sirenPhase) > 0;
    ctx.fillStyle = phase ? '#ff2e2e' : '#2e6aff';
    ctx.fillRect(-4, -h / 2 + 2, 8, 6);
    ctx.fillStyle = phase ? '#2e6aff' : '#ff2e2e';
    ctx.fillRect(-4, h / 2 - 8, 8, 6);
  }
  // Damage smoke tint on a battered car.
  if (car.hp < 45 && !car.wrecked) {
    ctx.fillStyle = 'rgba(40,40,40,0.3)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 14, -h / 2, 14, h, 6);
    ctx.fill();
  }
}

function drawCars(ctx, G) {
  for (const car of G.cars) {
    if (!inView(G, car.x, car.y, 60)) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    drawCarBody(ctx, car, G.time);
    ctx.restore();
  }
}

function drawPersonShape(ctx, x, y, angle, shirt, skin, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (opts.down) {
    // Lying flat: a stretched-out shape, hat askew.
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(40,30,15,0.2)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(15, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(opts.walkPhase || 0) * 1.5;
  ctx.fillStyle = 'rgba(40,30,15,0.22)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  // Gun arm when aiming.
  if (opts.armed) {
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
  }
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(3, bob * 0.3, 6.5, 0, Math.PI * 2);
  ctx.fill();
  if (opts.hat) {
    ctx.fillStyle = opts.hat;
    ctx.beginPath();
    ctx.arc(3, bob * 0.3 - 1, 7, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
}

function drawHealthBar(ctx, x, y, hp01, w = 30) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - w / 2, y, w, 5);
  ctx.fillStyle = hp01 > 0.4 ? '#5ad86a' : '#ff4a3a';
  ctx.fillRect(x - w / 2, y, w * clamp(hp01, 0, 1), 5);
}

function drawPeople(ctx, G) {
  for (const ped of G.peds) {
    if (!inView(G, ped.x, ped.y, 40)) continue;
    drawPersonShape(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, {
      down: ped.state === 'down', walkPhase: ped.walkPhase,
    });
  }
  for (const cop of G.cops) {
    if (!inView(G, cop.x, cop.y, 40)) continue;
    drawPersonShape(ctx, cop.x, cop.y, cop.angle, '#2e4a7a', '#e8b88a', {
      armed: true, hat: '#1d2f4a', walkPhase: cop.walkPhase,
    });
    if (cop.hp < 50) drawHealthBar(ctx, cop.x, cop.y - 22, cop.hp / 50);
  }
  for (const e of G.enemies) {
    if (!inView(G, e.x, e.y, 40)) continue;
    drawPersonShape(ctx, e.x, e.y, e.angle, '#7a2e2e', '#c98a5a', {
      armed: true, walkPhase: e.walkPhase,
    });
    drawHealthBar(ctx, e.x, e.y - 22, e.hp / 60);
    // Red name tag so the target reads instantly.
    ctx.font = 'bold 11px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6a5a';
    ctx.fillText('KING', e.x, e.y - 28);
  }
}

function drawPlayer(ctx, G) {
  const p = G.player;
  if (!p.onFoot || G.demo) return;
  if (!inView(G, p.x, p.y, 40)) return;
  drawPersonShape(ctx, p.x, p.y, p.angle, '#ff7a2e', '#e8b88a', {
    armed: true, walkPhase: p.walkPhase || 0,
  });
  // White ring so the player never gets lost in a crowd.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 16 + Math.sin(G.time * 4) * 1.2, 0, Math.PI * 2);
  ctx.stroke();
}
