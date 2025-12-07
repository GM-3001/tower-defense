// engine.js - canvas fit + main loop + utilities
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function fitCanvas(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const Engine = {
  last: performance.now(),
  run(fn){
    const loop = (ts)=>{
      const dt = ts - Engine.last;
      Engine.last = ts;
      fn(dt/1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
};

function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function isMobile(){ return /Mobi|Android/i.test(navigator.userAgent); }
