// ui.js - fixed, wires up menu, HUD, buttons, mobile controls
// (Do NOT define a global render() here — game.js provides render())

const menuScreen = document.getElementById('menuScreen');
const playBtn = document.getElementById('playBtn');
const editorBtn = document.getElementById('editorBtn');
const playModeMenu = document.getElementById('playModeMenu');
const normalMode = document.getElementById('normalMode');
const endlessMode = document.getElementById('endlessMode');
const cancelMode = document.getElementById('cancelMode');
const hud = document.getElementById('hud');
const towerPanel = document.getElementById('towerPanel');
const editorPanel = document.getElementById('editorPanel');
const mobileControls = document.getElementById('mobileControls');

playBtn.onclick = () => playModeMenu.classList.remove('hidden');
editorBtn.onclick = () => {
  menuScreen.style.display = 'none';
  editorPanel.classList.remove('hidden');
  // ensure editor UI shows
  document.getElementById('editorPanel').style.display = 'block';
};

normalMode.onclick = () => startFromEditor('normal');
endlessMode.onclick = () => startFromEditor('endless');
cancelMode.onclick = () => playModeMenu.classList.add('hidden');

document.getElementById('pauseBtn').onclick = () => { Game.running = !Game.running; };
document.getElementById('menuBackBtn').onclick = () => location.reload();

/**
 * Start game using editor path if available, otherwise fallback demo path.
 * This function starts the engine loop and spawns the first wave.
 */
function startFromEditor(mode) {
  // choose path: if editor path exists use it, else fallback demo path
  const path = (Editor.path && Editor.path.length > 1) ? Editor.path.slice() : [
    { x: 80, y: Math.round(canvas.height * 0.5) },
    { x: Math.round(canvas.width * 0.3), y: Math.round(canvas.height * 0.5) },
    { x: Math.round(canvas.width * 0.3), y: Math.round(canvas.height * 0.15) },
    { x: Math.round(canvas.width * 0.7), y: Math.round(canvas.height * 0.15) },
    { x: Math.round(canvas.width * 0.7), y: Math.round(canvas.height * 0.75) },
    { x: Math.round(canvas.width - 80), y: Math.round(canvas.height * 0.75) }
  ];

  menuScreen.style.display = 'none';
  playModeMenu.classList.add('hidden');
  hud.classList.remove('hidden');
  towerPanel.classList.remove('hidden');
  // hide editor UI
  document.getElementById('editorPanel').classList.add('hidden');

  // initialize game + UI
  Game.init(path);
  Game.mode = mode;
  document.getElementById('modeLabel').innerText = mode.toUpperCase();

  // copy saved waves if any
  if (Editor.savedWaves && Editor.savedWaves.length) Game.waves = Editor.savedWaves.slice();

  // start the engine loop (only once; Engine.run handles requestAnimationFrame)
  Engine.run((dt) => {
    Game.update(dt);
    // call the render function defined in game.js
    if (typeof render === 'function') render();
    updateUI();
  });

  // first wave
  Game.spawnWave();
}

/** update HUD and tower list */
function updateUI() {
  document.getElementById('money').innerText = 'Money: $' + Game.money;
  document.getElementById('lives').innerText = 'Lives: ' + Game.lives;
  document.getElementById('wave').innerText = 'Wave: ' + Game.wave;

  // towers list
  const list = document.getElementById('towerList');
  list.innerHTML = '';
  Object.values(Game.TOWERS).forEach(t => {
    const div = document.createElement('div');
    div.className = 'towerBtn' + (Game.placingType === t.id ? ' selected' : '');
    div.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><div style="width:14px;height:14px;background:${t.color};border-radius:3px"></div><div><b>${t.name}</b><div class="hint">Cost $${t.cost}</div></div></div><div style="font-weight:700">$${t.cost}</div>`;
    div.onclick = () => { Game.placingType = t.id; updateUI(); };
    list.appendChild(div);
  });

  // selected info
  if (Game.selectedTower) {
    selectedInfo.innerHTML = `<b>${Game.selectedTower.type.name}</b><div class="hint">DMG ${Game.selectedTower.dmg} • RNG ${Math.round(Game.selectedTower.range)} • FR ${Game.selectedTower.fireRate}s</div>`;
    upgradeBtn.disabled = false; sellBtn.disabled = false;
    upgradeHint.innerText = `Upgrade costs scale with levels`;
  } else {
    selectedInfo.innerText = 'None';
    upgradeBtn.disabled = true; sellBtn.disabled = true;
    upgradeHint.innerText = '';
  }
}

document.getElementById('upgradeBtn').onclick = () => {
  if (!Game.selectedTower) return alert('Select a tower first');
  const choice = prompt('Type "d" for Damage path, "f" for Fire rate path');
  if (!choice) return;
  if (choice === 'd') Game.upgradeTower(Game.selectedTower, 'd');
  else if (choice === 'f') Game.upgradeTower(Game.selectedTower, 'f');
};
document.getElementById('sellBtn').onclick = () => {
  if (!Game.selectedTower) return;
  Game.sellTower(Game.selectedTower);
};

window.selectTowerType = (t) => { Game.placingType = t; updateUI(); };

/* Mobile controls binding */
if (isMobile()) {
  mobileControls.classList.remove('hidden');
  document.getElementById('mc1').onclick = () => selectTowerType('basic');
  document.getElementById('mc2').onclick = () => selectTowerType('sniper');
  document.getElementById('mc3').onclick = () => selectTowerType('rapid');
// =============================
//   TOWER PLACEMENT INPUT FIX
// =============================
let lastClickTime = 0;

// Detect clicks on canvas (placement + selection)
canvas.addEventListener("click", (e) => {
    // Do not place towers in editor
    if (!Game.running) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const now = Date.now();
    const delta = now - lastClickTime;
    lastClickTime = now;

    // Update preview position
    if (Game.placingType) {
        Game.placementPreview = { x, y, type: Game.placingType };
    }

    // Double-click places tower
    if (delta < 250) {
        if (!Game.placingType) return; // no tower selected
        Game.placeTower(x, y, Game.placingType);
        Game.placementPreview = null;
        return;
    }

    // Single click: check tower selection
    let closest = null;
    let closestDist = 99999;
    for (const t of Game.towers) {
        const d = Math.hypot(t.x - x, t.y - y);
        if (d < 20 && d < closestDist) {
            closest = t;
            closestDist = d;
        }
    }

    Game.selectedTower = closest;
    updateUI();
});

// Right-click to sell tower (desktop)
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    if (!Game.running) return;
    if (!Game.selectedTower) return;

    Game.sellTower(Game.selectedTower);
});

}
