// editor.js - path drawing and wave builder
const Editor = {
  drawing: true,
  path: [],
  currentWave: [],
  savedWaves: []
};

document.getElementById('toggleDraw').onclick = ()=>{
  Editor.drawing = !Editor.drawing;
  document.getElementById('toggleDraw').innerText = Editor.drawing ? 'Toggle Draw' : 'Add Points';
};

document.getElementById('resetPath').onclick = ()=>{
  Editor.path = [];
};

document.getElementById('savePath').onclick = ()=>{
  if(Editor.path.length < 2) return alert('Add at least 2 points');
  alert('Path saved. You can now Play.');
};

document.getElementById('addToWave').onclick = ()=>{
  const sel = document.getElementById('enemySelect').value;
  Editor.currentWave.push(sel);
  document.getElementById('wavePreview').value = Editor.currentWave.join(',');
};

document.getElementById('saveWave').onclick = ()=>{
  const txt = document.getElementById('wavePreview').value.trim();
  if(!txt) return alert('Enter wave composition');
  const arr = txt.split(',').map(s=>s.trim()).filter(Boolean);
  Editor.savedWaves.push(arr);
  document.getElementById('wavePreview').value='';
  Editor.currentWave = [];
  alert('Wave saved');
};

canvas.addEventListener('click', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if(document.getElementById('menuScreen').style.display !== 'none') return;
  if(!document.getElementById('editorPanel').classList.contains('hidden') || document.getElementById('editorPanel').style.display !== 'none'){
    // editor mode
    if(Editor.drawing) Editor.path.push({x,y});
    else Editor.path.push({x,y});
    return;
  }
  // if game running -> placement / select
  if(Game.running){
    // double-click & selection handled in ui.js interactions
  }
});
