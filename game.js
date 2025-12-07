// Polished Tower Defense (single-page) - game.js
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// make canvas size match CSS layout (responsive)
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------- game state ----------
let money = 150, lives = 10, wave = 0;
let running = false;
let paused = false;
let endless = false;

const state = {
  towers: [],
  enemies: [],
  bullets: [],
  spawning: false,
  waveInProgress: false,
  selectedType: null,
  selectedTower: null
};

// prettier path (smooth multi-segment)
const pathPoints = [
  [0.06, 0.30], [0.28, 0.30], [0.28, 0.60], [0.55, 0.60], [0.55, 0.35], [0.82, 0.35], [0.82, 0.72], [0.98, 0.72]
];
// convert (% of canvas) to pixels
function pathPx() {
  return pathPoints.map(p => [p[0] * canvas.width, p[1] * canvas.height]);
}

// ---------- tower definitions ----------
const TOWER_DEFS = {
  basic: { cost: 50, range: 110, rate: 45, dmg: 22, color: '#ffd166', upgradeCost: 60 },
  rapid: { cost: 80, range: 90, rate: 14, dmg: 8, color: '#ffd6a6', upgradeCost: 80 },
  slow: { cost: 90, range: 120, rate: 80, dmg: 12, color: '#7ee787', upgradeCost: 90, slow: 0.55 }
};

// ---------- helpers ----------
function ui(id) { return document.getElementById(id) }
function worldPointOnPath(t) {
  // t in [0,1] along whole polyline
  const pts = pathPx();
  const totalSeg = pts.length - 1;
  if (totalSeg <= 0) return [0, 0];
  let seg = Math.min(totalSeg - 1, Math.floor(t * totalSeg));
  const localT = (t * totalSeg) - seg;
  const a = pts[seg], b = pts[seg + 1];
  return [a[0] + (b[0] - a[0]) * localT, a[1] + (b[1] - a[1]) * localT];
}

// ---------- game objects ----------
class Enemy {
  constructor(hp, speed) {
    this.t = 0; this.hp = hp; this.maxHp = hp; this.speed = speed;
    this.slowTimer = 0;
    this.dead = false;
  }
  pos() { return worldPointOnPath(this.t); }
  update(dt) {
    const slowMult = this.slowTimer > 0 ? 0.5 : 1;
    const adv = this.speed * dt * slowMult;
    this.t += adv;
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.t >= 1) { // reached end
      lives--; this.dead = true;
      ui('lives').textContent = lives;
    }
    if (this.hp <= 0) { this.dead = true; money += 8; ui('money').textContent = money; }
  }
  draw() {
    const [x, y] = this.pos();
    // body
    ctx.beginPath(); ctx.fillStyle = '#ff6b6b'; ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    // HP bar
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 14, y - 20, 28, 5);
    ctx.fillStyle = '#7ee787'; ctx.fillRect(x - 14, y - 20, 28 * (Math.max(0, this.hp) / this.maxHp), 5);
  }
}

class Tower {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type; this.def = TOWER_DEFS[type];
    this.cd = 0;
    this.level = 1;
  }
  update(dt) {
    if (this.cd > 0) this.cd = Math.max(0, this.cd - dt * 60);
    if (this.cd <= 0) {
      // find target furthest along path within range
      let best = null, bestT = -1;
      for (let e of state.enemies) {
        if (e.dead) continue;
        const [ex, ey] = e.pos();
        const d = Math.hypot(ex - this.x, ey - this.y);
        if (d <= this.def.range) {
          if (e.t > bestT) { bestT = e.t; best = e; }
        }
      }
      if (best) {
        // fire
        const bullet = { x: this.x, y: this.y, tx: best, speed: this._bulletSpeed(), dmg: this.def.dmg, type: this.type, ttl: 0.6 };
        state.bullets.push(bullet);
        this.cd = this.def.rate;
        // muzzle flash recorded by bullet.ttl
      }
    }
  }
  _bulletSpeed() { return 8 + (this.def.rate / 20); }
  draw() {
    // base
    ctx.beginPath(); ctx.fillStyle = this.def.color; ctx.arc(this.x, this.y, 14, 0, Math.PI * 2); ctx.fill();
    // level ring
    ctx.beginPath(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.arc(this.x, this.y, 18, 0, Math.PI * 2); ctx.stroke();
  }
}

// ---------- placement & UI ----------
ui('money').textContent = money;
ui('lives').textContent = lives;
ui('wave').textContent = wave;

document.querySelectorAll('.tower-select').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tower-select').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    state.selectedType = b.dataset.type;
  });
});

// double-click to place tower
canvas.addEventListener('dblclick', (ev) => {
  if (!state.selectedType) return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const def = TOWER_DEFS[state.selectedType];
  if (money < def.cost) { alert('Not enough money'); return; }
  state.towers.push(new Tower(x, y, state.selectedType));
  money -= def.cost; ui('money').textContent = money;
});

// click to open tower panel
canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  state.selectedTower = null;
  for (let t of state.towers) {
    if (Math.hypot(t.x - x, t.y - y) < 18) { state.selectedTower = t; break; }
  }
  if (state.selectedTower) openPanel(state.selectedTower);
  else closePanel();
});

// panel actions: upgrade & sell
ui('upgradeBtn').addEventListener('click', () => {
  const t = state.selectedTower; if (!t) return;
  const cost = t.def.upgradeCost * t.level;
  if (money < cost) { alert('Not enough money'); return; }
  money -= cost; ui('money').textContent = money;
  t.level++;
  // buff stats
  t.def.range = Math.round(t.def.range * 1.12);
  t.def.dmg = Math.round(t.def.dmg * 1.18);
  refreshPanel(t);
});
ui('sellBtn').addEventListener('click', () => {
  const t = state.selectedTower; if (!t) return;
  const refund = Math.floor(t.def.cost * 0.5) + (t.level - 1) * 10;
  money += refund; ui('money').textContent = money;
  const i = state.towers.indexOf(t); if (i >= 0) state.towers.splice(i, 1);
  closePanel();
});

// panel display helpers
function openPanel(t) {
  ui('towerPanel').classList.remove('hidden');
  refreshPanel(t);
}
function closePanel() { ui('towerPanel').classList.add('hidden'); state.selectedTower = null; }
function refreshPanel(t) {
  ui('panelType').textContent = t.type;
  ui('panelLevel').textContent = t.level;
  ui('panelRange').textContent = t.def.range;
  ui('panelDamage').textContent = t.def.dmg;
  ui('upgradeCost').textContent = Math.floor(t.def.upgradeCost * t.level);
}

// menu / controls
ui('startBtn').addEventListener('click', () => {
  running = true;
  endless = ui('endlessToggle').checked;
  if (endless) ui('modeLabel').textContent = 'Mode: Endless';
  else ui('modeLabel').textContent = 'Mode: Standard';
  ui('overlay').style.display = 'none';
  ui('nextWave').disabled = false;
});
ui('nextWave').addEventListener('click', () => startWave());
ui('pauseBtn').addEventListener('click', () => { paused = !paused; ui('pauseBtn').textContent = paused ? 'Resume' : 'Pause'; });

// ---------- wave logic ----------
let spawnTimer = 0;
let toSpawn = 0;
function startWave() {
  if (state.waveInProgress) return;
  wave++; ui('wave').textContent = wave;
  toSpawn = 6 + wave * 2;
  spawnTimer = 0;
  state.spawning = true;
  state.waveInProgress = true;
  ui('nextWave').disabled = true; // disabled until wave ends (unless endless)
}

// ---------- spawning & update ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!running || paused) { draw(); requestAnimationFrame(loop); return; }

  // spawn logic
  if (state.spawning && toSpawn > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      // spawn an enemy — scale with wave
      const hp = 30 + Math.floor(wave * 10);
      const spd = 0.035 + Math.min(0.05, wave * 0.003);
      state.enemies.push(new Enemy(hp, spd));
      toSpawn--;
      spawnTimer = 0.6; // seconds between spawns
    }
    if (toSpawn <= 0) state.spawning = false;
  }

  // update enemies
  for (let e of state.enemies) e.update(dt);
  state.enemies = state.enemies.filter(e => !e.dead);

  // update towers
  for (let t of state.towers) t.update(dt);

  // update bullets
  for (let b of state.bullets) {
    const tgt = b.tx;
    // move toward target position each frame
    const [tx, ty] = tgt.pos();
    const dx = tx - b.x, dy = ty - b.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = b.speed * dt * 60;
    if (dist <= step) {
      // hit
      tgt.hp -= b.dmg;
      if (b.type === 'slow') tgt.slowTimer = Math.max(tgt.slowTimer, 1.5);
      b.dead = true;
    } else {
      b.x += dx / dist * step;
      b.y += dy / dist * step;
    }
    b.ttl -= dt;
    if (b.ttl <= 0) b.dead = true;
  }
  state.bullets = state.bullets.filter(b => !b.dead);

  // check wave end
  if (!state.spawning && state.enemies.length === 0 && state.waveInProgress) {
    state.waveInProgress = false;
    ui('nextWave').disabled = false;
    if (endless) {
      // auto-start next wave after a short delay
      setTimeout(() => { startWave(); }, 900);
    }
  }

  // check gameover
  if (lives <= 0) {
    running = false;
    ui('overlay').style.display = 'flex';
    ui('overlay').querySelector('h1').textContent = 'Game Over';
    ui('startBtn').textContent = 'Restart';
  }

  draw();
  requestAnimationFrame(loop);
}

// ---------- rendering ----------
function draw() {
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // bg subtle grid
  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let gx = 0; gx < canvas.width; gx += 36) ctx.fillRect(gx, 0, 1, canvas.height);
  for (let gy = 0; gy < canvas.height; gy += 36) ctx.fillRect(0, gy, canvas.width, 1);
  ctx.restore();

  // path track
  const pts = pathPx();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // outer track
  ctx.beginPath(); ctx.lineWidth = 28; ctx.strokeStyle = '#13222b';
  ctx.moveTo(pts[0][0], pts[0][1]); for (let p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();
  // inner track
  ctx.beginPath(); ctx.lineWidth = 12; ctx.strokeStyle = '#1f3a43';
  ctx.moveTo(pts[0][0], pts[0][1]); for (let p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();
  // center guide (subtle accent)
  ctx.beginPath(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,210,102,0.06)';
  ctx.moveTo(pts[0][0], pts[0][1]); for (let p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke();

  // draw towers
  for (let t of state.towers) t.draw();

  // draw enemies
  for (let e of state.enemies) e.draw();

  // draw bullets (animated)
  for (let b of state.bullets) {
    ctx.beginPath();
    ctx.fillStyle = b.type === 'slow' ? '#7ee787' : '#ffd166';
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
    // muzzle flash near source (tiny particle)
    ctx.beginPath(); ctx.fillStyle = 'rgba(255,210,102,0.12)'; ctx.arc(b.x, b.y, 8, 0, Math.PI * 2); ctx.fill();
  }

  // tower preview when selecting a type
  if (state.selectedType) {
    // draw preview following mouse
    if (lastMouse.x !== null) {
      const def = TOWER_DEFS[state.selectedType];
      ctx.beginPath(); ctx.globalAlpha = 0.12; ctx.fillStyle = def.color; ctx.arc(lastMouse.x, lastMouse.y, def.range, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.fillStyle = def.color; ctx.arc(lastMouse.x, lastMouse.y, 12, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// mouse pos for preview
const lastMouse = { x: null, y: null };
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  lastMouse.x = e.clientX - r.left; lastMouse.y = e.clientY - r.top;
});

// ---------- start loop ----------
requestAnimationFrame(loop);

// ---------- firing logic run on interval (keeps bullets and rates sane) ----------
setInterval(() => {
  // choose targets for towers (create bullets)
  for (let t of state.towers) {
    // cooldown integer ticks
    if (!t._tick) t._tick = 0; t._tick++;
    if (t._tick < t.def.rate) continue;
    t._tick = 0;
    // choose target
    let best = null; let bestT = -1;
    for (let e of state.enemies) {
      if (e.dead) continue;
      const [ex, ey] = e.pos();
      const d = Math.hypot(ex - t.x, ey - t.y);
      if (d <= t.def.range) {
        if (e.t > bestT) { bestT = e.t; best = e; }
      }
    }
    if (best) {
      // spawn bullet object
      state.bullets.push({ x: t.x, y: t.y, tx: best, speed: t._bulletSpeed ? t._bulletSpeed() : (8 + (t.def.rate / 20)), dmg: t.def.dmg, type: t.type, ttl: 1.2, dead: false });
    }
  }
}, 80);

// attach tower def helper
Tower.prototype.def = null;
Tower.prototype._bulletSpeed = function () { return 8 + (this.def.rate / 20); };
(function linkDefs() { // ensure each tower has def reference when created
  const oldCtor = Tower;
  const NewTower = function (x, y, type) {
    const obj = new oldCtor(x, y, type);
    obj.def = TOWER_DEFS[type];
    return obj;
  };
  NewTower.prototype = oldCtor.prototype;
  window.Tower = NewTower;
})();

// expose UI elements used earlier
function ui(id) { return document.getElementById(id); }

// fix for panel elements (they appear earlier)
if (!ui('upgradeBtn')) { /* if panel IDs differ, fallback create references for robustness */ }
