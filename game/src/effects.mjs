// effects.mjs — juice: particles, skid marks, bullet tracers, floating
// score text and screen shake. All state lives here; systems only spawn.
export class Effects {
  constructor() {
    this.particles = [];
    this.skids = [];
    this.tracers = [];
    this.floaters = [];
    this.shakeMag = 0;
  }

  burst(x, y, n, color, speed = 160, life = 0.5, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.8), maxLife: life,
        size: size * (0.6 + Math.random() * 0.8), color, drag: 3, grav: 0,
      });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  sparks(x, y) {
    this.burst(x, y, 10, '#ffd94d', 220, 0.35, 2.5);
    this.burst(x, y, 4, '#ffffff', 300, 0.2, 2);
  }

  smoke(x, y) {
    this.particles.push({
      x, y, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
      life: 0.9, maxLife: 0.9, size: 7 + Math.random() * 5,
      color: 'rgba(90,90,90,0.5)', drag: 1, grav: -20,
    });
  }

  hitPuff(x, y, color = '#ff5a4a') {
    this.burst(x, y, 8, color, 130, 0.4, 3);
  }

  tracer(x1, y1, x2, y2, color = '#ffe27a') {
    this.tracers.push({ x1, y1, x2, y2, life: 0.09, color });
  }

  floater(x, y, text, color = '#ffffff', size = 18) {
    this.floaters.push({ x, y, text, color, size, life: 1.4 });
  }

  skid(x1, y1, x2, y2) {
    this.skids.push({ x1, y1, x2, y2, life: 5 });
    if (this.skids.length > 400) this.skids.splice(0, this.skids.length - 400);
  }

  shake(mag) {
    this.shakeMag = Math.min(14, this.shakeMag + mag);
  }

  update(dt) {
    const dragStep = (p) => {
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    };
    for (const p of this.particles) dragStep(p);
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const s of this.skids) s.life -= dt;
    this.skids = this.skids.filter((s) => s.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 34 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shakeMag = Math.max(0, this.shakeMag - 30 * dt);
  }

  // Skid marks lie on the ground, under cars and people.
  drawGround(ctx) {
    if (this.skids.length === 0) return;
    ctx.strokeStyle = 'rgba(40,40,40,0.35)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of this.skids) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }

  drawAir(ctx) {
    for (const t of this.tracers) {
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = Math.min(1, t.life / 0.09);
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx) {
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 0.6);
      ctx.font = `bold ${f.size}px Verdana, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}
