// Polished Tower Defense — Extended feature set
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// responsive canvas
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------- state ----------
let money = 150, lives = 10, wave = 0;
let running = false, paused = false, endless = false;
let shakeTimer = 0, shakeIntensity = 0;

const state = {
  towers: [],
  enemies: [],
  bullets: [],
  particles: [],
  spawning: false,
  waveInProgress: false,
  selectedType: null,
  selectedTower: null
};

// path definition (%)
const pathPoints = [
  [0.06, 0.30], [0.28, 0.30], [0.28, 0.60], [0.55, 0.60], [0.55, 0.35], [0.82, 0.35], [0.82, 0.72], [0.98, 0.72]
];
function pathPx() { return pathPoints.map(p => [p[0] * canvas.width, p[1] * canvas.height]); }
function worldPointOnPath(t) {
  const pts = pathPx(); const segs = pts.length - 1;
  if (segs <= 0) return [0, 0];
  let seg = Math.min(segs - 1, Math.floor(t * segs));
  const localT = (t * segs) - seg; const a = pts[seg], b = pts[seg + 1];
  return [a[0] + (b[0] - a[0]) * localT, a[1] + (b[1] - a[1]) * localT];
}

// ---------- tower defs ----------
const TOWER_DEFS = {
  basic: { cost: 50, range: 110, rate: 45, dmg: 22, color: '#ffd166', upgradeCost: 60 },
  rapid: { cost: 80, range: 90, rate: 14, dmg: 8, color: '#ffd6a6', upgradeCost: 80 },
  sniper: { cost: 90, range: 180, rate: 90, dmg: 60, color: '#ffd1b3', upgradeCost: 120 },
  freeze: { cost: 100, range: 120, rate: 70, dmg: 6, color: '#a6f0ff', upgradeCost: 90, slow: 0.5 },
  buff: { cost: 120, range: 140, rate: 120, dmg: 6, color: '#bfe7a6', upgradeCost: 100, buffPower: 0.18 }
};

// ---------- helpers ----------
function ui(id) { return document.getElementById(id); }
ui('money').textContent = money;
ui('lives').textContent = lives;
ui('wave').textContent = wave;

// ---------- entities ----------
class Enemy {
  constructor(type = 'normal', hp = 30, speed = 0.035) {
    this.type = type; this.t = 0; this.hp = hp; this.maxHp = hp; this.speed = speed; this.slowTimer = 0; this.dead = false;
    this.regenTimer = (type === 'regen') ? 0.5 : 0;
  }
  pos() { return worldPointOnPath(this.t); }
  update(dt) {
    const slowMult = this.slowTimer > 0 ? 0.5 : 1; const adv = this.speed * dt * slowMult;
    this.t += adv;
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.type === 'regen') { this.regenTimer -= dt; if (this.regenTimer <= 0) { this.hp = Math.min(this.maxHp, this.hp + 2); this.regenTimer = 0.6; } }
    if (this.t >= 1) { lives--; this.dead = true; triggerShake(8, 0.4); ui('lives').textContent = lives; }
    if (this.hp <= 0) { this.dead = true; money += (this.type === 'boss' ? 500 : 8); ui('money').textContent = money; }
  }
  draw() {
    const [x, y] = this.pos();
    // body (different color by type)
    ctx.beginPath();
    const colors = { normal: '#ff6b6b', fast: '#ff9b6b', armored: '#d5d5d5', regen: '#ffa6d9', boss: '#b06bff' };
    ctx.fillStyle = colors[this.type] || '#ff6b6b';
    ctx.arc(x, y, (this.type === 'boss' ? 22 : 10), 0, Math.PI * 2);
    ctx.fill();
    // HP
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 16, y - 22, 32, 5);
    ctx.fillStyle = '#7ee787'; ctx.fillRect(x - 16, y - 22, 32 * (Math.max(0, this.hp) / this.maxHp), 5);
  }
}

class Tower {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type; this.def = JSON.parse(JSON.stringify(TOWER_DEFS[type]));
    this._tick = 0; this.level = 1; this.upper = 0; this.lower = 0; this.lockUpper = false; this.lockLower = false;
  }
  update(dt) { // tick handled in setInterval; keep for compatibility
    // buff towers apply passive buff
    if (this.type === 'buff') return;
  }
  _bulletSpeed() { return 8 + (this.def.rate / 20); }
  draw() {
    ctx.beginPath(); ctx.fillStyle = this.def.color; ctx.arc(this.x, this.y, 14, 0, Math.PI * 2); ctx.fill();
    // ring for level
    ctx.beginPath(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.arc(this.x, this.y, 18, 0, Math.PI * 2); ctx.stroke();
    // small text for level
    ctx.fillStyle = '#000'; ctx.font = '10px sans-serif'; ctx.fillText(this.level, this.x - 4, this.y + 4);
    // draw buff aura for buff towers
    if (this.type === 'buff') {
      ctx.beginPath(); ctx.globalAlpha = 0.06; ctx.fillStyle = '#ffd166'; ctx.arc(this.x, this.y, this.def.range, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}

// particles for trails and bursts
function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x, y, vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 2.4, life: 0.5 + Math.random() * 0.5, color
    });
  }
}

// ---------- input & UI ----------
document.querySelectorAll('.tower-select').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tower-select').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected'); state.selectedType = b.dataset.type;
  });
});

// double-click placement
canvas.addEventListener('dblclick', (e) => {
  if (!state.selectedType) return;
  const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
  const def = TOWER_DEFS[state.selectedType];
  if (money < def.cost) { alert('Not enough money'); return; }
  const t = new Tower(x, y, state.selectedType);
  t.def = JSON.parse(JSON.stringify(def)); // own copy
  state.towers.push(t);
  money -= def.cost; ui('money').textContent = money;
});

// select tower to open panel
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
  state.selectedTower = null;
  for (let t of state.towers) { if (Math.hypot(t.x - x, t.y - y) < 18) { state.selectedTower = t; break; } }
  if (state.selectedTower) openPanel(state.selectedTower);
  else closePanel();
});

// panel logic
ui('upgradeUpper').addEventListener('click', () => {
  const t = state.selectedTower; if (!t) return;
  if (t.lockUpper) { alert('Upper path locked'); return; }
  const cost = Math.floor(t.def.upgradeCost * (t.upper + 1));
  if (money < cost) { alert('Not enough money'); return; }
  money -= cost; ui('money').textContent = money;
  t.upper++;
  t.level++;
  // upper path does offense: increase dmg and slight range
  t.def.dmg = Math.round(t.def.dmg * 1.25);
  t.def.range = Math.round(t.def.range * 1.06);
  // lock rule: if upper reaches 3, lock lower
  if (t.upper >= 3) t.lockLower = true;
  refreshPanel(t);
});
ui('upgradeLower').addEventListener('click', () => {
  const t = state.selectedTower; if (!t) return;
  if (t.lockLower) { alert('Lower path locked'); return; }
  const cost = Math.floor(t.def.upgradeCost * (t.lower + 1));
  if (money < cost) { alert('Not enough money'); return; }
  money -= cost; ui('money').textContent = money;
  t.lower++; t.level++;
  // lower path does utility: decrease rate (faster), special effects
  t.def.rate = Math.max(6, Math.round(t.def.rate * 0.85));
  // for freeze increase slow power
  if (t.type === 'freeze') t.def.slow = Math.max(0.25, t.def.slow * 0.8);
  // lock rule
  if (t.lower >= 3) t.lockUpper = true;
  refreshPanel(t);
});
ui('sellBtn').addEventListener('click', () => {
  const t = state.selectedTower; if (!t) return;
  const refund = Math.floor(t.def.cost * 0.5) + (t.level - 1) * 8;
  money += refund; ui('money').textContent = money;
  const i = state.towers.indexOf(t); if (i >= 0) state.towers.splice(i, 1);
  closePanel();
});
function openPanel(t) {
  ui('panelType').textContent = t.type;
  ui('panelLevel').textContent = t.level;
  ui('upperLevel').textContent = t.upper;
  ui('lowerLevel').textContent = t.lower;
  ui('upCost').textContent = Math.floor(t.def.upgradeCost * (t.upper + 1));
  ui('lowCost').textContent = Math.floor(t.def.upgradeCost * (t.lower + 1));
  ui('towerPanel').classList.remove('hidden');
}
function refreshPanel(t) {
  openPanel(t);
  if (t.lockLower) ui('upgradeLower').disabled = true; else ui('upgradeLower').disabled = false;
  if (t.lockUpper) ui('upgradeUpper').disabled = true; else ui('upgradeUpper').disabled = false;
}
function closePanel() { ui('towerPanel').classList.add('hidden'); state.selectedTower = null; }

// menu controls
ui('startBtn').addEventListener('click', () => {
  running = true; endless = ui('endlessToggle').checked;
  ui('modeLabel').textContent = endless ? 'Mode: Endless' : 'Mode: Standard';
  ui('overlay').style.display = 'none'; ui('nextWave').disabled = false;
});
ui('nextWave').addEventListener('click', () => startWave());
ui('pauseBtn').addEventListener('click', () => { paused = !paused; ui('pauseBtn').textContent = paused ? 'Resume' : 'Pause'; });

// ---------- wave & spawn ----------
let spawnTimer = 0, toSpawn = 0;
function startWave() {
  if (state.waveInProgress) return;
  wave++; ui('wave').textContent = wave;
  // special boss at wave 20
  if (wave === 20) {
    toSpawn = 1; // single boss
    state.spawning = true; state.waveInProgress = true; ui('nextWave').disabled = true;
  } else {
    toSpawn = 6 + wave * 2;
    state.spawning = true; state.waveInProgress = true; ui('nextWave').disabled = true;
  }
}

// spawn variety
function spawnEnemyOfWave() {
  // choose type based on wave
  let pick = Math.random();
  if (wave >= 20) {
    // boss
    state.enemies.push(new Enemy('boss', 1200, 0.01));
    return;
  }
  if (pick < 0.12 + wave * 0.01) { state.enemies.push(new Enemy('armored', 60 + wave * 6, 0.02)); return; }
  if (pick < 0.28) { state.enemies.push(new Enemy('fast', 18 + wave * 2, 0.06)); return; }
  if (pick < 0.42) { state.enemies.push(new Enemy('regen', 30 + wave * 3, 0.035)); return; }
  // default normal
  state.enemies.push(new Enemy('normal', 30 + wave * 4, 0.035 + Math.min(0.02, wave * 0.0008)));
}

// shake trigger
function triggerShake(intensity = 6, duration = 0.5) { shakeTimer = duration; shakeIntensity = intensity; }

// ---------- update loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!running || paused) { draw(); requestAnimationFrame(loop); return; }

  // spawn logic
  if (state.spawning && toSpawn > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemyOfWave();
      toSpawn--; spawnTimer = 0.5;
      if (toSpawn <= 0) state.spawning = false;
    }
  }

  // update enemies
  for (let e of state.enemies) e.update(dt);
  state.enemies = state.enemies.filter(e => !e.dead);

  // buff tower effects apply every loop: buff towers increase nearby towers' dmg/rate temporarily via a multiplier
  for (let t of state.towers) {
    if (t.type === 'buff') {
      for (let oth of state.towers) {
        if (oth === t) continue;
        const d = Math.hypot(oth.x - t.x, oth.y - t.y);
        if (d <= t.def.range) {
          // apply temporary buffs by directly adjusting def (simple approach)
          oth._buffed = oth._buffed || { dmgMult: 1, rateMult: 1 };
          oth._buffed.dmgMult = 1 + t.def.buffPower;
          oth._buffed.rateMult = 1 - t.def.buffPower * 0.5;
        }
      }
    }
  }

  // tower firing handled in interval below; but we keep update for visuals
  for (let t of state.towers) t.update(dt);

  // update bullets
  for (let b of state.bullets) {
    const tgt = b.tx;
    const [tx, ty] = tgt.pos();
    const dx = tx - b.x, dy = ty - b.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = b.speed * dt * 60;
    // trail: store previous
    b.trail = b.trail || [];
    b.trail.unshift({ x: b.x, y: b.y, life: 0.45 });
    if (b.trail.length > 8) b.trail.pop();

    if (dist <= step || tgt.dead) {
      // hit
      tgt.hp -= b.dmg * (tgt.type === 'armored' ? 0.7 : 1); // armored takes less
      if (b.type === 'freeze') tgt.slowTimer = Math.max(tgt.slowTimer, 1.6);
      // burst particles
      spawnParticles(tx, ty, (b.type === 'freeze' ? '#a6f0ff' : '#ffd166'), 10);
      b.dead = true;
    } else {
      b.x += dx / dist * step;
      b.y += dy / dist * step;
    }
    b.ttl -= dt;
    if (b.ttl <= 0) b.dead = true;
  }
  state.bullets = state.bullets.filter(b => !b.dead);

  // update particles
  for (let p of state.particles) {
    p.x += p.vx; p.y += p.vy; p.life -= dt;
  }
  state.particles = state.particles.filter(p => p.life > 0);

  // check wave end
  if (!state.spawning && state.enemies.length === 0 && state.waveInProgress) {
    state.waveInProgress = false; ui('nextWave').disabled = false;
    if (endless) { setTimeout(() => startWave(), 900); }
    // check boss win
    if (wave >= 20) {
      // if boss died and no enemies, you win
      ui('overlay').style.display = 'flex';
      ui('overlay').querySelector('h1').textContent = 'You Win!';
      ui('startBtn').textContent = 'Play Again';
      running = false;
    }
  }

  // check gameover
  if (lives <= 0) {
    running = false;
    ui('overlay').style.display = 'flex';
    ui('overlay').querySelector('h1').textContent = 'Game Over';
    ui('startBtn').textContent = 'Restart';
  }

  // shake update
  if (shakeTimer > 0) { shakeTimer = Math.max(0, shakeTimer - dt); if (shakeTimer === 0) shakeIntensity = 0; }

  draw();
  requestAnimationFrame(loop);
}

// ---------- firing interval ----------
setInterval(() => {
  if (!running || paused) return;
  for (let t of state.towers) {
    // tick
    t._tick = (t._tick || 0) + 1;
    // effective rate factoring buff/rate multipliers
    const rateMult = (t._buffed && t._buffed.rateMult) ? t._buffed.rateMult : 1;
    const effectiveRate = Math.max(6, Math.round(t.def.rate * rateMult));
    if (t._tick < effectiveRate) continue;
    t._tick = 0;
    // find target (furthest along path) within range
    let best = null, bestT = -1;
    for (let e of state.enemies) {
      if (e.dead) continue;
      const [ex, ey] = e.pos(); const d = Math.hypot(ex - t.x, ey - t.y);
      if (d <= t.def.range) {
        if (e.t > bestT) { bestT = e.t; best = e; }
      }
    }
    if (best) {
      // bullet damage factoring buff
      const dmgMult = (t._buffed && t._buffed.dmgMult) ? t._buffed.dmgMult : 1;
      const dmg = Math.round(t.def.dmg * dmgMult);
      state.bullets.push({ x: t.x, y: t.y, tx: best, speed: t._bulletSpeed(), dmg, type: t.type, ttl: 1.2, trail: [] });
      // small muzzle particles
      spawnParticles(t.x + (Math.random() - 0.5) * 6, t.y + (Math.random() - 0.5) * 6, (t.type === 'freeze' ? '#a6f0ff' : '#ffd166'), 4);
    }
  }
}, 80);

// ---------- drawing ----------
function draw() {
  // shake offset
  let sx = 0, sy = 0;
  if (shakeTimer > 0) { sx = (Math.random() - 0.5) * shakeIntensity; sy = (Math.random() - 0.5) * shakeIntensity; }

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(sx, sy);

  // subtle grid
  ctx.save(); ctx.globalAlpha = 0.04; for (let gx = 0; gx < canvas.width; gx += 36) ctx.fillRect(gx, 0, 1, canvas.height);
  for (let gy = 0; gy < canvas.height; gy += 36) ctx.fillRect(0, gy, canvas.width, 1); ctx.restore();

  // path
  const pts = pathPx();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.lineWidth = 28; ctx.strokeStyle = '#13222b'; ctx.moveTo(pts[0][0], pts[0][1]); for (let p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();
  ctx.beginPath(); ctx.lineWidth = 12; ctx.strokeStyle = '#1f3a43'; ctx.moveTo(pts[0][0], pts[0][1]); for (let p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();
  ctx.beginPath(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,210,102,0.06)'; ctx.moveTo(pts[0][0], pts[0][1]); for (let p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();

  // draw towers
  for (let t of state.towers) t.draw();

  // draw bullets trails first (behind bullets)
  for (let b of state.bullets) {
    if (b.trail) {
      for (let i = 0; i < b.trail.length; i++) {
        const tr = b.trail[i];
        ctx.beginPath(); ctx.globalAlpha = (0.14 * (1 - i / b.trail.length)); ctx.fillStyle = (b.type === 'freeze' ? '#a6f0ff' : '#ffd166'); ctx.arc(tr.x, tr.y, 3 + i * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }

  // draw enemies
  for (let e of state.enemies) e.draw();

  // draw bullets
  for (let b of state.bullets) {
    ctx.beginPath(); ctx.fillStyle = (b.type === 'freeze' ? '#a6f0ff' : '#ffd166'); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
  }

  // draw particles
  for (let p of state.particles) {
    ctx.beginPath(); ctx.globalAlpha = Math.max(0, p.life / 0.8); ctx.fillStyle = p.color; ctx.arc(p.x, p.y, 2 + p.life * 2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }

  ctx.restore(); // end translate

  // HTML HUD sits on top; update values (kept here to ensure sync)
  ui('money').textContent = money;
  ui('lives').textContent = lives;
  ui('wave').textContent = wave;
}

// mouse for preview
const lastMouse = { x: null, y: null };
canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); lastMouse.x = e.clientX - r.left; lastMouse.y = e.clientY - r.top; });

// start loop
requestAnimationFrame(loop);

// helper particles
function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    state.particles.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0.6 + Math.random() * 0.5, color });
  }
}

// simple tutorial button
ui('tutorialBtn').addEventListener('click', () => alert('Select a tower, double-click the map to place it. Click a tower to upgrade or sell. Use Next Wave to start waves. Boss appears at wave 20.'));
