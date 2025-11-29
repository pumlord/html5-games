// game.js — ES module (no transpile). Drop into same folder as index.html + styles.css.
// - Draws programmatic fish (right-facing assets).
// - Fish swim right->left; when drawing reversed we flip the canvas so visually they face left.
// - Click on a fish to catch it. Simple payout/score logic and animations.
// - Uses provided aquarium background URL.

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const BG_SRC = 'https://zmotrin.github.io/assets/aquarium/aquarium.webp'; // user's background
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// HUD elements
const balanceEl = document.getElementById('balance');
const scoreEl = document.getElementById('score');
const caughtLabel = document.getElementById('caughtLabel');
const spawnBtn = document.getElementById('spawnBtn');
const clearBtn = document.getElementById('clearBtn');
const soundToggle = document.getElementById('soundToggle');

// Game state
let balance = 100;
let score = 0;
let caught = 0;
let fishes = [];
let particles = [];
let lastTime = 0;
let bgImage = new Image();
bgImage.crossOrigin = 'anonymous';
bgImage.src = BG_SRC;

// Sound: simple WebAudio tones (no files)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function tone(freq, dur = 0.12, type = 'sine', vol = 0.12) {
  if (!soundToggle.checked) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  o.stop(audioCtx.currentTime + dur + 0.02);
}
function playCatch() { tone(900, 0.08, 'triangle', 0.14); tone(1400, 0.06, 'sine', 0.08); }
function playMiss()  { tone(220, 0.18, 'sine', 0.12); }
function playSpawn() { tone(320, 0.06, 'square', 0.06); }

// Utility random
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

// Fish presets (8 soft-shaded color combos). Assets are *drawn* facing right by default.
const fishPresets = [
  { body:'#ffb86b', accent:'#ff7b45', eye:'#111', score:5, speed: 1.1 },
  { body:'#7fe3ff', accent:'#4fb8da', eye:'#071', score:6, speed: 1.2 },
  { body:'#ffd3f0', accent:'#ff89be', eye:'#111', score:7, speed: 1.35 },
  { body:'#a1ff7a', accent:'#5fe23c', eye:'#111', score:4, speed: 0.95 },
  { body:'#ffd67f', accent:'#ffb24a', eye:'#111', score:5, speed: 1.0 },
  { body:'#d4b3ff', accent:'#a37eff', eye:'#111', score:8, speed: 1.5 },
  { body:'#ff9aa2', accent:'#ff6f7a', eye:'#111', score:6, speed: 1.25 },
  { body:'#86e3b9', accent:'#3fd0a0', eye:'#111', score:4, speed: 0.9 }
];

class Fish {
  constructor(preset){
    this.preset = preset;
    // spawn at right side (so movement right->left)
    this.w = rand(46, 86) * (1 + Math.random()*0.3); // variety sizes
    this.h = this.w * 0.6;
    this.x = WIDTH + rand(20, 160);
    this.y = rand(40, HEIGHT - 60);
    this.speed = preset.speed * rand(0.7, 1.3) + (this.w/140) * 0.6;
    this.phase = Math.random() * Math.PI * 2;
    this.caught = false;
    this.rarity = (preset.score >= 7 ? 'rare' : (preset.score >= 6 ? 'uncommon' : 'common'));
    // sprite facing right by default, but we will draw flipped because movement is leftward
    this.facingRightAsset = true; // asset orientation
    this.direction = -1; // -1 means moving left (right-to-left)
    this.id = Math.random().toString(36).slice(2,9);
    this.catchValue = preset.score;
    this.opacity = 0;
    this.spawnTime = performance.now();
  }

  update(dt){
    if(this.caught){
      // float up / shrink effect
      this.y -= 60 * dt;
      this.x += 10 * dt; // slight drift
      this.opacity -= 0.6 * dt;
      return;
    }
    // bobbing along sinusoidal vertical motion
    this.phase += dt * (0.8 + (this.speed*0.12));
    this.y += Math.sin(this.phase) * 8 * dt * (this.w/70);
    this.x += this.speed * this.direction * 60 * dt; // pixels per second scaled
    // gentle wrap or removal
    if(this.x < -this.w - 40) this.offscreen = true;
    // fade in
    if(this.opacity < 1) this.opacity = Math.min(1, (performance.now() - this.spawnTime) / 300);
  }

  draw(ctx){
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.opacity);
    // center for drawing
    const cx = this.x;
    const cy = this.y;
    // When moving left (direction === -1), flip drawing horizontally so fish faces left.
    ctx.translate(cx, cy);
    if(this.direction < 0){
      ctx.scale(-1, 1); // flip, because base asset drawn facing right
    }
    // scale by size
    const s = this.w / 100;
    ctx.scale(s, s);

    drawFishShape(ctx, this.preset.body, this.preset.accent, this.preset.eye);
    ctx.restore();
  }

  containsPoint(px, py){
    // simple bounding circle detection
    const dx = px - (this.x);
    const dy = py - (this.y);
    const r = Math.max(this.w, this.h) * 0.5;
    return dx*dx + dy*dy < r*r;
  }
}

// Procedural fish draw routine — draws a friendly, soft-shaded vector fish facing RIGHT
function drawFishShape(ctx, bodyColor='#ffbb66', accent='#ff7b45', eyeColor='#111') {
  // All drawing assumes fish center at 0,0 scaled so approx width 100 and height ~60
  // Body shadow
  ctx.save();
  ctx.translate(0, 0);

  // main body ellipse
  ctx.beginPath();
  ctx.ellipse(0, 0, 48, 28, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // soft inner gradient (fake soft shading)
  // lighter highlight
  ctx.beginPath();
  ctx.ellipse(-10, -8, 28, 14, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = shade(bodyColor, 0.18);
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // tail
  ctx.beginPath();
  ctx.moveTo(48, 0);
  ctx.lineTo(80, -18);
  ctx.lineTo(80, 18);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  // small tail inner
  ctx.beginPath();
  ctx.moveTo(48, 2);
  ctx.lineTo(66, -8);
  ctx.lineTo(66, 12);
  ctx.closePath();
  ctx.fillStyle = shade(accent, -0.08);
  ctx.fill();

  // fin top
  ctx.beginPath();
  ctx.moveTo(-6, -28);
  ctx.quadraticCurveTo(10, -40, 40, -24);
  ctx.quadraticCurveTo(14, -30, -6, -28);
  ctx.fillStyle = accent;
  ctx.fill();

  // fin bottom
  ctx.beginPath();
  ctx.moveTo(-6, 28);
  ctx.quadraticCurveTo(10, 40, 40, 24);
  ctx.quadraticCurveTo(14, 30, -6, 28);
  ctx.fillStyle = shade(accent, -0.06);
  ctx.fill();

  // gill lines
  ctx.strokeStyle = shade(bodyColor, -0.25);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, -3);
  ctx.quadraticCurveTo(2, -4, 10, -3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3, 3);
  ctx.quadraticCurveTo(6, 3.5, 14, 5);
  ctx.stroke();

  // eye
  ctx.beginPath();
  ctx.arc(-18, -4, 5.5, 0, Math.PI*2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-17, -3, 2.6, 0, Math.PI*2);
  ctx.fillStyle = eyeColor;
  ctx.fill();

  // small outline (subtle)
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 48, 28, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// Helper shade function (lighten/darken hex color by factor between -1 and 1)
function shade(hex, percent){
  // hex may be #rrggbb
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16);
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const amt = Math.round(255 * percent);
  r = clamp(r + amt, 0, 255);
  g = clamp(g + amt, 0, 255);
  b = clamp(b + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

// Particle bubble for catch effect
class Bubble {
  constructor(x,y){
    this.x = x; this.y = y; this.vy = -rand(30,70); this.vx = rand(-20,20);
    this.r = rand(4,12); this.life = 1; this.ttl = rand(0.7,1.4);
  }
  update(dt){
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt / this.ttl;
  }
  draw(ctx){
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// Initialize some fish
function spawnFish(n=1){
  for(let i=0;i<n;i++){
    const preset = fishPresets[randInt(0, fishPresets.length-1)];
    fishes.push(new Fish(preset));
    playSpawn();
  }
}

// Clear fish
function clearFish(){
  fishes = [];
  particles = [];
}

// Catch handling
function catchFish(fish, px, py){
  if (fish.caught) return;
  fish.caught = true;
  // reward: simple: add fish.catchValue * 2 dollars and score
  const payout = fish.catchValue * 2;
  balance += payout;
  score += fish.catchValue * 10;
  caught++;
  caughtLabel.textContent = `Caught: ${caught}`;
  balanceEl.textContent = balance.toFixed(2);
  scoreEl.textContent = score;
  // spawn bubble particles
  for(let i=0;i<10;i++) particles.push(new Bubble(px + rand(-8,8), py + rand(-8,8)));
  playCatch();
}

// Mouse / touch interactions
function getPointerPos(evt){
  const rect = canvas.getBoundingClientRect();
  if (evt.touches && evt.touches[0]) evt = evt.touches[0];
  return {
    x: (evt.clientX - rect.left) * (canvas.width / rect.width),
    y: (evt.clientY - rect.top) * (canvas.height / rect.height)
  };
}

canvas.addEventListener('click', (e)=>{
  const p = getPointerPos(e);
  // check top-most fish under point (iterate reverse order)
  for(let i=fishes.length-1;i>=0;i--){
    const f = fishes[i];
    if (!f.caught && f.containsPoint(p.x, p.y)){
      catchFish(f, p.x, p.y);
      // small net ripple: create particles outward
      for(let k=0;k<6;k++){
        particles.push(new Bubble(p.x + rand(-10,10), p.y + rand(-10,10)));
      }
      return;
    }
  }
  // if click missed
  playMiss();
});

// spawn / clear buttons
spawnBtn.addEventListener('click', ()=> spawnFish(randInt(1,3)));
clearBtn.addEventListener('click', clearFish);

// Game loop
function update(ts){
  const dt = Math.min(0.034, (ts - lastTime) / 1000 || 0.016);
  lastTime = ts;

  // update fishes
  for(let f of fishes) f.update(dt);
  // remove dead/offscreen
  fishes = fishes.filter(f => !(f.offscreen && !f.caught) && f.opacity > -0.1);

  // particles
  for(let b of particles) b.update(dt);
  particles = particles.filter(p => p.life > 0);

  // If there are not enough fish, keep a comfortable number (background lively)
  if(fishes.length < 6 && Math.random() < 0.016) spawnFish(1);

  draw();

  requestAnimationFrame(update);
}

// Draw everything
function draw(){
  // draw background - scaled to cover canvas
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  if (bgImage.complete && bgImage.naturalWidth) {
    // fit-cover logic: fill canvas preserving aspect ratio
    const sw = bgImage.width, sh = bgImage.height;
    const scale = Math.max(WIDTH / sw, HEIGHT / sh);
    const swScaled = sw * scale, shScaled = sh * scale;
    const sx = (WIDTH - swScaled) / 2, sy = (HEIGHT - shScaled) / 2;
    ctx.drawImage(bgImage, sx, sy, swScaled, shScaled);
    // overlay slight tint for readability
    ctx.fillStyle = 'rgba(3,8,15,0.18)';
    ctx.fillRect(0,0,WIDTH,HEIGHT);
  } else {
    // fallback background
    ctx.fillStyle = '#06202a';
    ctx.fillRect(0,0,WIDTH,HEIGHT);
  }

  // draw fishes (back-to-front)
  for(let f of fishes){
    f.draw(ctx);
  }

  // draw particles
  for(let p of particles) p.draw(ctx);

  // small HUD overlay inside canvas (optional)
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fillRect(8,8,152,36);
  ctx.fillStyle = '#fff';
  ctx.font = '14px Inter, Arial';
  ctx.fillText(`Balance: $${balance.toFixed(0)}`, 14, 28);
  ctx.restore();
}

// Initialization entry
function init(){
  // resize handling — canvas uses fixed internal resolution but CSS scales responsively
  window.addEventListener('resize', ()=> {
    // nothing required: canvas has fixed internal resolution (650x420) and scales with CSS width:100%
  });

  // preload a few fish
  spawnFish(6);

  // start loop
  requestAnimationFrame((t)=> {
    lastTime = t;
    update(t);
  });
}

// small utility: seed initial spawn when bg loaded
bgImage.onload = () => {
  // allow audio resume on user interaction (autoplay policy)
  document.addEventListener('click', resumeAudioOnce, { once: true });
  init();
};

// resume audio for autoplay
function resumeAudioOnce(){
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// kick off even if bg fails
setTimeout(()=> {
  if (!bgImage.complete) init();
}, 800);

// expose a console-friendly API for debugging (optional)
window.FishingGame = {
  spawnFish, clearFish
};
