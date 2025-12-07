// game.js - gameplay: towers, enemies, bullets, upgrades, selling
const Game = {
  running:false,
  mode:'normal',
  money:0,
  lives:0,
  wave:0,
  towers:[],
  enemies:[],
  bullets:[],
  particles:[],
  path:[],
  selectedTower:null,
  placingType:null,
  placementPreview:null,
  waves:[],

  TOWERS: {
    basic: {id:'basic', name:'Basic', cost:70, dmg:12, range:130, fireRate:0.42, color:'#ffd86b'},
    sniper:{id:'sniper',name:'Sniper',cost:120,dmg:45, range:300, fireRate:1.4, color:'#78d5ff'},
    rapid: {id:'rapid', name:'Rapid', cost:85, dmg:5, range:110, fireRate:0.10, color:'#ff8aa1'},
    slow:  {id:'slow',  name:'Slow',  cost:90, dmg:3, range:110, fireRate:0.32, slow:0.6, color:'#8ff'}
  },

  ENEMIES: {
    slow: (wave)=> ({speed: 60 + wave*2, hp: 30 + wave*6, color:'#9cf', size:14}),
    fast: (wave)=> ({speed: 160 + wave*4, hp: 18 + wave*4, color:'#fc9', size:12}),
    tank: (wave)=> ({speed: 45 + wave, hp: 120 + wave*30, color:'#c99', size:18}),
    swarm:(wave)=> ({speed: 100 + wave*3, hp: 8 + wave*2, color:'#9f9', size:10}),
    boss:(wave)=> ({speed: 50 + wave, hp: 600 + wave*150, color:'#ffec6b', size:28})
  },

  init(path){
    Game.path = path.slice();
    Game.money = 220; Game.lives = 18; Game.wave = 0;
    Game.towers=[]; Game.enemies=[]; Game.bullets=[]; Game.particles=[];
    Game.running = true;
    Game.selectedTower = null;
    Game.placingType = null;
    Game.placementPreview = null;
  },

  spawnWave(){
    let comp;
    if(Game.waves.length && Game.wave < Game.waves.length) {
      comp = Game.waves[Game.wave].slice();
    } else {
      comp = Game.autoWave(Game.wave);
    }
    let i=0;
    const interval = setInterval(()=>{
      if(i >= comp.length){ clearInterval(interval); return; }
      Game.spawnEnemy(comp[i]);
      i++;
    }, 500);
    Game.wave++;
  },

  autoWave(n){
    const pool = ['slow','fast','swarm','tank'];
    const arr = [];
    const count = Math.min(8 + Math.floor(n*1.5), 30);
    for(let i=0;i<count;i++) arr.push(pool[Math.floor(Math.random()*pool.length)]);
    if(n%6===0) arr.push('boss');
    return arr;
  },

  spawnEnemy(type){
    const stats = Game.ENEMIES[type](Game.wave);
    Game.enemies.push({
      x: Game.path[0].x, y: Game.path[0].y,
      hp: stats.hp, maxHp:stats.hp, speed: stats.speed/60,
      color: stats.color, size: stats.size, idx:0
    });
  },

  update(dt){
    if(!Game.running) return;
    // enemies
    for(let i=Game.enemies.length-1;i>=0;i--){
      const e = Game.enemies[i];
      const next = Game.path[Math.min(e.idx+1, Game.path.length-1)];
      const dx = next.x - e.x, dy = next.y - e.y;
      const d = Math.hypot(dx,dy) || 0.0001;
      if(d < e.speed*dt*60) e.idx++;
      else { e.x += dx/d * e.speed*dt*60; e.y += dy/d * e.speed*dt*60; }
      if(e.idx >= Game.path.length-1 && dist(e, Game.path[Game.path.length-1]) < 6){
        Game.enemies.splice(i,1);
        Game.lives--; if(Game.lives<=0) GameOver();
      }
    }
    // towers shoot
    for(const t of Game.towers){
      t.cooldown -= dt;
      if(t.cooldown <= 0){
        const target = Game.enemies.find(en=> dist(en,t) <= t.range );
        if(target){
          t.cooldown = t.fireRate;
          // bullet
          Game.bullets.push({x:t.x,y:t.y,target:target,dmg:t.dmg,slow:t.slow||0,trail:[]});
          spawnMuzzle(t.x,t.y,t.color);
        }
      }
    }
    // bullets
    for(let i=Game.bullets.length-1;i>=0;i--){
      const b = Game.bullets[i];
      if(!Game.enemies.includes(b.target)){ Game.bullets.splice(i,1); continue; }
      const dx = b.target.x - b.x, dy = b.target.y - b.y;
      const d = Math.hypot(dx,dy) || 0.0001;
      const sp = 420 * dt;
      b.x += dx/d * sp; b.y += dy/d * sp;
      b.trail.push({x:b.x,y:b.y});
      if(b.trail.length>8) b.trail.shift();
      if(dist(b, b.target) < b.target.size + 2){
        b.target.hp -= b.dmg;
        if(b.slow) b.target.speed *= b.slow;
        Game.bullets.splice(i,1);
        if(b.target.hp <= 0){
          Game.money += b.target.size>20? 60:12;
          const idx = Game.enemies.indexOf(b.target);
          if(idx!==-1) Game.enemies.splice(idx,1);
        }
      }
    }
    // particles
    for(let i=Game.particles.length-1;i>=0;i--){
      const p=Game.particles[i];
      p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; p.life-=dt;
      if(p.life<=0) Game.particles.splice(i,1);
    }

    // spawn waves if no enemies
    if(Game.enemies.length===0 && Game.bullets.length===0) {
      // small delay then next wave
      if(!Game._nextWaveTimer) {
        Game._nextWaveTimer = setTimeout(()=>{ Game._nextWaveTimer = null; Game.spawnWave(); }, 1200);
      }
    }
  },

  placeTower(x,y,type){
    const proto = Game.TOWERS[type];
    if(!proto) return;
    if(Game.money < proto.cost) return flash('Not enough money');
    if(isOnPath(x,y)) return flash('Too close to path');

    const tower = {
      x,y, type:proto, dmg:proto.dmg, range:proto.range, fireRate:proto.fireRate, cooldown:0,
      color:proto.color, cost:proto.cost, upgradeD:0, upgradeF:0
    };
    Game.towers.push(tower);
    Game.money -= proto.cost;
    Game.selectedTower = tower;
    updateUI();
  },

  sellTower(t){
    const refund = Math.floor(t.cost * 0.65);
    Game.money += refund;
    Game.towers = Game.towers.filter(x=>x!==t);
    if(Game.selectedTower===t) Game.selectedTower = null;
    updateUI();
  },

  upgradeTower(t, path){
    if(!t) return;
    const upCost = 60 * (1 + (path==='d'? t.upgradeD : t.upgradeF));
    if(Game.money < upCost) return flash('Not enough money');
    Game.money -= upCost;
    if(path==='d'){ t.dmg = Math.round(t.dmg * 1.5); t.upgradeD++; }
    else { t.fireRate = Math.max(0.05, t.fireRate * 0.85); t.upgradeF++; }
    updateUI();
  }
};

/* small helpers */
function spawnMuzzle(x,y,color){
  for(let i=0;i<6;i++) Game.particles.push({x,y,vx:(Math.random()-0.5)*6,vy:-Math.random()*6,life:0.2+Math.random()*0.3,size:1+Math.random()*2,color});
}
function spawnParticles(x,y,n=8){
  for(let i=0;i<n;i++) Game.particles.push({x,y,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,life:0.4+Math.random()*0.4,size:1+Math.random()*3,color:'#ffd86b'});
}
function flash(s){ console.log(s); /* small placeholder; UI could show toast */ }

function isOnPath(x,y){
  for(let i=0;i<Game.path.length-1;i++){
    const a=Game.path[i], b=Game.path[i+1];
    const vx=b.x-a.x, vy=b.y-a.y;
    const wx=x-a.x, wy=y-a.y;
    const c=(vx*wx + vy*wy) / (vx*vx + vy*vy || 1);
    const t=clamp(c,0,1);
    const px=a.x + vx*t, py=a.y + vy*t;
    if(dist({x,y},{x:px,y:py}) < 36) return true;
  }
  return false;
}

function GameOver(){ Game.running=false; alert('Game Over'); location.reload(); }

/* rendering */
function render(){
  // background
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // subtle grid
  ctx.fillStyle='rgba(255,255,255,0.01)';
  for(let x=0;x<canvas.width;x+=40) ctx.fillRect(x,0,1,canvas.height);
  for(let y=0;y<canvas.height;y+=40) ctx.fillRect(0,y,canvas.width,1);

  // path
  if(Game.path.length>0){
    ctx.lineCap='round';
    ctx.lineWidth=36; ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.beginPath(); ctx.moveTo(Game.path[0].x,Game.path[0].y);
    for(const p of Game.path) ctx.lineTo(p.x,p.y); ctx.stroke();
    ctx.lineWidth=18; ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.moveTo(Game.path[0].x,Game.path[0].y);
    for(const p of Game.path) ctx.lineTo(p.x,p.y); ctx.stroke();
  }

  // towers
  for(const t of Game.towers){
    // shadow
    ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(t.x,t.y+8,18,8,0,0,Math.PI*2); ctx.fill();
    // body
    ctx.fillStyle=t.color; ctx.beginPath(); ctx.arc(t.x,t.y,16,0,Math.PI*2); ctx.fill();
    // inner
    ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.arc(t.x,t.y,7,0,Math.PI*2); ctx.fill();
  }

  // enemies
  for(const e of Game.enemies){
    // shadow
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(e.x,e.y+e.size*0.6,e.size*1.2,e.size*0.6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=e.color; ctx.beginPath(); ctx.arc(e.x,e.y,e.size,0,Math.PI*2); ctx.fill();
    // hp bar
    ctx.fillStyle='#222'; ctx.fillRect(e.x-e.size, e.y-e.size-10, e.size*2, 6);
    ctx.fillStyle='#7fff7f'; ctx.fillRect(e.x-e.size, e.y-e.size-10, e.size*2 * clamp(e.hp/e.maxHp,0,1), 6);
  }

  // bullets
  for(const b of Game.bullets){
    ctx.globalAlpha=0.12;
    for(const p of b.trail) ctx.fillRect(p.x-2,p.y-2,4,4);
    ctx.globalAlpha=1;
    ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(b.x,b.y,4,0,Math.PI*2); ctx.fill();
  }

  // particles
  for(const p of Game.particles){
    ctx.globalAlpha = clamp(p.life,0,1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // placement preview
  if(Game.placementPreview){
    const pv = Game.placementPreview;
    const proto = Game.TOWERS[pv.type];
    ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(pv.x,pv.y,proto.range,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = proto.color; ctx.beginPath(); ctx.arc(pv.x,pv.y,14,0,Math.PI*2); ctx.fill();
  }

  // highlight selected
  if(Game.selectedTower){
    ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(Game.selectedTower.x,Game.selectedTower.y,Game.selectedTower.range+6,0,Math.PI*2); ctx.stroke();
  }
}
