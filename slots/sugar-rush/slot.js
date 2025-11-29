// slot.js (UPDATED)
// Changes:
// 1) Scatter weight lowered to 1 (see SYMBOLS below).
// 2) Symbol pools are built dynamically (including a non-scatter pool).
// 3) After generating the final grid we count scatters, award free spins,
//    THEN *remove/replace* all scatter symbols BEFORE any cascade evaluation.
// 4) All refills during cascades use a non-scatter pool so scatters never
//    reappear mid-cascade.
// 5) Removed the duplicate "remove scatters" code that existed inside cascade loop.

// -----------------------------
// CONFIG / SYMBOLS / PAYTABLE
// -----------------------------
const SYMBOLS = [
  { id: '🍓', name: 'strawberry', weight: 18 },
  { id: '🍉', name: 'watermelon', weight: 16 },
  { id: '🍇', name: 'grapes', weight: 15 },
  { id: '🍊', name: 'orange', weight: 14 },
  { id: '🍬', name: 'candy', weight: 12 },
  { id: '🍭', name: 'lollipop', weight: 10 },
  { id: '⭐',  name: 'star', weight: 8  },
  { id: '💎', name: 'gem', weight: 4  },
  // scatter weight reduced to 1 (was 6)
  { id: '🎁', name: 'scatter', weight: 1 }
];

const PAYTABLE = {
  '🍓': {5:0.25, 8:0.6, 11:1.2, 15:3},
  '🍉': {5:0.20, 8:0.5, 11:1.0, 15:2.5},
  '🍇': {5:0.16, 8:0.4, 11:0.8, 15:2.0},
  '🍊': {5:0.15, 8:0.35, 11:0.7, 15:1.8},
  '🍬': {5:0.12, 8:0.3, 11:0.6, 15:1.6},
  '🍭': {5:0.10, 8:0.25, 11:0.5, 15:1.4},
  '⭐':  {5:0.08, 8:0.2, 11:0.4, 15:1.2},
  '💎': {5:0.30, 8:0.8, 11:1.6, 15:4.0}
};

function clusterBracket(size){
  if(size >= 15) return 15;
  if(size >= 11) return 11;
  if(size >= 8) return 8;
  if(size >= 5) return 5;
  return 0;
}

// Grid config
const ROWS = 7;
const COLS = 7;

// gameplay state
let balance = 1000;
let bet = 1;
let grid = [];
let tileMult = [];
let freeSpins = 0;
let autoplay = { active:false, remaining:0 };
let lastWin = 0;

// DOM refs
const gridEl = document.getElementById('grid');
const balanceEl = document.getElementById('balance');
const spinBtn = document.getElementById('spinBtn');
const autoplayBtn = document.getElementById('autoplayBtn');
const stopAutoBtn = document.getElementById('stopAutoBtn');
const betSelect = document.getElementById('betSelect');
const msgTempEl = document.getElementById('msgTemp');
const freeSpinsEl = document.getElementById('freeSpins');
const globalMultEl = document.getElementById('globalMultiplier');
const autoCountEl = document.getElementById('autoCount');
const paytableToggle = document.getElementById('paytable-toggle');
const paytableModal = document.getElementById('paytable-modal');
const closeModal = document.getElementById('close-modal');

// === Pools ===
// Will be filled in init()
let symbolPool = [];        // includes scatters (for initial generation & animation blur)
let nonScatterPool = [];   // excludes scatters (for refills during cascade)

// Apply global paytable scaling to match expected RTP
const GLOBAL_PAYTABLE_SCALE = 1.53;
Object.keys(PAYTABLE).forEach(sym => {
  const spec = PAYTABLE[sym];
  Object.keys(spec).forEach(k => {
    spec[k] = spec[k] * GLOBAL_PAYTABLE_SCALE;
  });
});

function buildSymbolPools(){
  symbolPool = [];
  nonScatterPool = [];
  for (const s of SYMBOLS) {
    for (let i = 0; i < (s.weight||0); i++) {
      symbolPool.push(s.id);
      if (s.id !== '🎁') nonScatterPool.push(s.id);
    }
  }
  // fallback safety
  if(nonScatterPool.length === 0){
    // should never happen with config above, but just in case
    nonScatterPool = SYMBOLS.filter(x=>x.id!=='🎁').map(x=>x.id);
  }
}

// init / UI helpers
function updateTotalsUI(){
  balanceEl.textContent = balance.toFixed(2);
  freeSpinsEl.textContent = freeSpins;
  let g = 1;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) g = Math.max(g, tileMult[r][c]||1);
  globalMultEl.textContent = g + 'x';
}

function updateBalance(){ updateTotalsUI(); }

// helpers
function randFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randSymbol(){ return randFrom(symbolPool); }        // can spawn scatter
function randNonScatterSymbol(){ return randFrom(nonScatterPool); } // no scatter

// initial DOM build
function init(){
  buildSymbolPools();
  gridEl.innerHTML = '';
  grid = [];
  tileMult = [];
  for(let r=0;r<ROWS;r++){
    grid[r] = [];
    tileMult[r] = [];
    for(let c=0;c<COLS;c++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r; cell.dataset.c = c;
      const badge = document.createElement('div');
      badge.className = 'tile-mult';
      badge.textContent = '';
      badge.style.display = 'none';
      cell.appendChild(badge);

      const sym = document.createElement('div');
      sym.className = 'symbol';
      sym.innerText = '';
      cell.appendChild(sym);

      gridEl.appendChild(cell);
      grid[r][c] = null;
      tileMult[r][c] = 1;
    }
  }
  updateTotalsUI();
  renderPayGrid();
  attachEvents();
}

// fill grid randomly (used only initial load)
function fillGridRandom(){
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      grid[r][c] = randNonScatterSymbol(); // avoid accidental initial scatters on load
    }
  }
  syncGridDOM();
}

function syncGridDOM(skipSymbolUpdate = false){
  const cells = gridEl.querySelectorAll('.cell');
  cells.forEach(cell => {
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    if(!skipSymbolUpdate){
      const symbolEl = cell.querySelector('.symbol');
      symbolEl.innerText = grid[r][c] || '';
    } else {
      const symbolEl = cell.querySelector('.symbol');
      if(symbolEl) symbolEl.innerText = grid[r][c] || '';
    }
    const badge = cell.querySelector('.tile-mult');
    if(badge){
      if(tileMult[r][c] && tileMult[r][c] > 1){
        badge.textContent = `${tileMult[r][c]}x`;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  });
  updateTotalsUI();
}

// ---------- cluster detection & evaluation ----------
function findClusters(){
  const visited = Array.from({length:ROWS}, ()=>Array(COLS).fill(false));
  const clusters = [];
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      if(visited[r][c]) continue;
      const sym = grid[r][c];
      if(!sym){ visited[r][c]=true; continue; }
      const q=[{r,c}], cells=[{r,c}];
      visited[r][c] = true;
      while(q.length){
        const cur = q.shift();
        const nbrs = [
          {r:cur.r-1,c:cur.c},{r:cur.r+1,c:cur.c},
          {r:cur.r,c:cur.c-1},{r:cur.r,c:cur.c+1}
        ];
        for(const n of nbrs){
          if(n.r<0||n.r>=ROWS||n.c<0||n.c>=COLS) continue;
          if(visited[n.r][n.c]) continue;
          if(grid[n.r][n.c] === sym){
            visited[n.r][n.c] = true;
            q.push({r:n.r,c:n.c});
            cells.push({r:n.r,c:n.c});
          }
        }
      }
      clusters.push({symbol: sym, cells});
    }
  }
  return clusters;
}

function evaluateClusters(clusters){
  let totalWin = 0;
  const detonations = [];
  const clusterPays = [];

  clusters.forEach(cl => {
    const size = cl.cells.length;
    const bracket = clusterBracket(size);
    if(bracket > 0 && cl.symbol !== '🎁'){
      const paySpec = PAYTABLE[cl.symbol];
      if(paySpec){
        const mult = paySpec[bracket] || 0;
        let clusterWin = 0;
        cl.cells.forEach(cell => {
          const tileM = tileMult[cell.r][cell.c] || 1;
          clusterWin += (bet * mult * tileM);
        });
        totalWin += clusterWin;
        clusterPays.push({symbol: cl.symbol, size, clusterWin, cells: cl.cells});
        cl.cells.forEach(cell => detonations.push(cell));
      }
    }
    // scatters are ignored for cluster payouts (handled earlier)
  });

  return { totalWin, detonations, clusterPays };
}

function countScattersInGrid(){
  let count = 0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(grid[r][c] === '🎁') count++;
  return count;
}

// Replace all scatter symbols with non-scatter symbols (before cascade)
function removeScattersBeforeCascade(){
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      if(grid[r][c] === '🎁'){
        grid[r][c] = randNonScatterSymbol();
      }
    }
  }
}

// apply detonations -> collapse columns and refill using non-scatter pool
async function applyDetonations(detList){
  const toRemove = Array.from({length:ROWS}, ()=>Array(COLS).fill(false));
  detList.forEach(({r,c}) => toRemove[r][c] = true);

  // First, mark cells as empty visually
  const cells = gridEl.querySelectorAll('.cell');
  detList.forEach(({r,c}) => {
    const idx = r * COLS + c;
    const cell = cells[idx];
    if(cell) {
      const symbolEl = cell.querySelector('.symbol');
      if(symbolEl) {
        symbolEl.classList.add('exploding');
        symbolEl.innerText = '';
      }
    }
  });

  await delay(100);

  // Calculate new grid state
  const newGrid = Array.from({length:ROWS}, ()=>Array(COLS).fill(null));

  for(let c=0;c<COLS;c++){
    const col = [];
    // Collect surviving symbols from bottom to top
    for(let r=ROWS-1;r>=0;r--){
      if(!toRemove[r][c]){
        col.push(grid[r][c]);
      }
    }
    // Add new symbols to fill the column
    const newSymbolsCount = ROWS - col.length;
    for(let i=0; i<newSymbolsCount; i++){
      col.push(randNonScatterSymbol());
    }
    // Write back to newGrid (bottom to top)
    for(let r=ROWS-1, i=0; r>=0; r--, i++){
      newGrid[r][c] = col[i];
    }
  }

  // Animate the tumble column by column with slight stagger
  for(let c=0; c<COLS; c++){
    // Add tumbling class to this column
    for(let r=0; r<ROWS; r++){
      const idx = r * COLS + c;
      const cell = cells[idx];
      if(cell) {
        cell.classList.add('tumbling');
      }
    }

    await delay(40); // Stagger each column slightly

    // Update symbols in this column
    for(let r=0; r<ROWS; r++){
      const idx = r * COLS + c;
      const cell = cells[idx];
      if(cell) {
        const symbolEl = cell.querySelector('.symbol');
        if(symbolEl) {
          symbolEl.classList.remove('exploding');
          symbolEl.innerText = newGrid[r][c];
        }
      }
    }
  }

  // Update the actual grid state
  for(let r=0; r<ROWS; r++){
    for(let c=0; c<COLS; c++){
      grid[r][c] = newGrid[r][c];
    }
  }

  await delay(200);

  // Remove tumbling class
  cells.forEach(cell => {
    cell.classList.remove('tumbling');
  });
}

// increase multipliers on detonated tiles (persist for current spin/free-spins)
function increaseTileMultipliers(cells){
  cells.forEach(({r,c})=>{
    tileMult[r][c] = (tileMult[r][c] || 1) + 1;
  });
}

// --- animation helper ---
async function performSpinAnimation(finalGrid){
  const cells = gridEl.querySelectorAll('.cell');
  const spinDuration = 1200;
  const symbolChangeInterval = 80;

  cells.forEach(cell => cell.classList.add('spinning'));

  const spinInterval = setInterval(() => {
    cells.forEach((cell, idx) => {
      const symbolEl = cell.querySelector('.symbol');
      if(symbolEl) symbolEl.innerText = randSymbol();
    });
  }, symbolChangeInterval);

  await delay(spinDuration);
  clearInterval(spinInterval);

  for(let c = 0; c < COLS; c++){
    await delay(60);
    for(let r = 0; r < ROWS; r++){
      const idx = r * COLS + c;
      const cell = cells[idx];
      if(cell) {
        cell.classList.remove('spinning');
        cell.classList.add('landing');
        const symbolEl = cell.querySelector('.symbol');
        if(symbolEl) symbolEl.innerText = finalGrid[r][c];
        setTimeout(()=>cell.classList.remove('landing'), 300);
      }
    }
  }
  await delay(150);
}

// main spin sequence
async function spinSequence(isFree=false){
  disableControls(true);
  lastWin = 0;
  msgTempEl.textContent = '';

  if(!isFree){
    if(balance < bet){ messagePop('Insufficient balance'); disableControls(false); return 0; }
    balance -= bet;
    updateTotalsUI();
  }

  if(!isFree && freeSpins === 0){
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) tileMult[r][c] = 1;
  }

  // Generate final grid: allow scatters here, but we'll handle them next
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      grid[r][c] = randSymbol();
    }
  }

  // Count scatters now (pre-cascade)
  const scatterCount = countScattersInGrid();

  // If scatters present -> award free spins per rules (before cascade)
  if(scatterCount >= 3){
    let awarded = (scatterCount === 3)? 10 : (scatterCount === 4)? 12 : (scatterCount === 5)? 15 : (scatterCount === 6)? 20 : 25;
    freeSpins += awarded;
    messagePop(`Bonus! ${awarded} Free Spins (🎁 x${scatterCount})`);
  }

  // *** REMOVE ALL SCATTERS BEFORE CASCADES (crucial change) ***
  if(scatterCount > 0){
    removeScattersBeforeCascade();
  }

  // Run reveal animation, passing the grid after scatter removal
  await performSpinAnimation(grid);

  // redraw DOM briefly
  syncGridDOM(true);

  // Cascading + evaluate clusters
  let spinWin = 0;
  let cascadeCount = 0;

  while(true){
    cascadeCount++;
    const clusters = findClusters();
    const evalRes = evaluateClusters(clusters);

    if(evalRes.totalWin > 0){
      highlightCells(evalRes.detonations);
      // increase multipliers (Sugar-Rush style: multipliers increase on exploded tiles)
      increaseTileMultipliers(evalRes.detonations);
      spinWin += evalRes.totalWin;
      await delay(350);
      await applyDetonations(evalRes.detonations); // refill uses nonScatter pool with animation
      // Update multiplier badges after tumble
      const cells = gridEl.querySelectorAll('.cell');
      cells.forEach(cell => {
        const r = +cell.dataset.r;
        const c = +cell.dataset.c;
        const badge = cell.querySelector('.tile-mult');
        if(badge){
          if(tileMult[r][c] && tileMult[r][c] > 1){
            badge.textContent = `${tileMult[r][c]}x`;
            badge.style.display = 'block';
          } else {
            badge.style.display = 'none';
          }
        }
      });
      await delay(100);
      continue;
    } else {
      // No paying clusters this cascade. Scatters were already removed earlier.
      break;
    }
  }

  lastWin = spinWin;
  balance += spinWin;
  updateTotalsUI();

  if(spinWin > 0){
    msgTempEl.textContent = `Win: $${spinWin.toFixed(2)}`;
    msgTempEl.style.color = '#00ff7a';
    playWin();
  } else {
    msgTempEl.textContent = '';
  }

  // If free spins were added earlier, consume them (they were already added to freeSpins)
  if(freeSpins > 0 && !isFree){
    // If we just triggered free spins on the base spin, run them automatically
    while(freeSpins > 0){
      freeSpins--;
      updateTotalsUI();
      await delay(300);
      await spinSequence(true);
    }
  }

  disableControls(false);
  return spinWin;
}

// highlight + UI helpers
function highlightCells(cells, addClass='explode'){
  cells.forEach(({r,c})=>{
    const idx = r*COLS + c;
    const cell = gridEl.children[idx];
    if(!cell) return;
    cell.classList.add('pop');
    setTimeout(()=>cell.classList.remove('pop'), 360);
  });
}

function delay(ms){ return new Promise(res=>setTimeout(res, ms)); }
function messagePop(txt){
  const old = document.getElementById('msgTemp'); if(old) old.remove();
  const el = document.createElement('div');
  el.id='msgTemp';
  el.style.position='fixed'; el.style.left='50%'; el.style.top='18px';
  el.style.transform='translateX(-50%)';
  el.style.padding='10px 16px'; el.style.background='rgba(0,0,0,0.7)';
  el.style.border='1px solid rgba(255,255,255,0.06)'; el.style.borderRadius='8px';
  el.style.zIndex=9999; el.innerText = txt;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2200);
}

function disableControls(lock){
  spinBtn.disabled = lock;
  autoplayBtn.disabled = lock;
  betSelect.disabled = lock;
  if(lock) spinBtn.classList.add('disabled'); else spinBtn.classList.remove('disabled');
}

// wrapper and autoplay
async function onSpin(){
  const isFree = freeSpins > 0;
  if(isFree){ freeSpins--; updateTotalsUI(); }
  const win = await spinSequence(isFree);
  lastWin = win;
  updateTotalsUI();

  if(autoplay.active){
    autoplay.remaining--;
    if(autoplay.remaining <= 0){
      stopAutoplay();
    } else if(autoplay.active){
      setTimeout(()=>{ onSpin(); }, 320);
    }
  }
}

function startAutoplay(){
  autoplay.active = true;
  autoplay.remaining = parseInt(autoCountEl.value,10) || 20;
  autoplayBtn.classList.add('hidden'); stopAutoBtn.classList.remove('hidden');
  onSpin();
}
function stopAutoplay(){
  autoplay.active = false;
  autoplay.remaining = 0;
  autoplayBtn.classList.remove('hidden'); stopAutoBtn.classList.add('hidden');
}

// UI events & paygrid
function attachEvents(){
  spinBtn.addEventListener('click', ()=>onSpin());
  autoplayBtn.addEventListener('click', ()=>startAutoplay());
  stopAutoBtn.addEventListener('click', ()=>stopAutoplay());
  betSelect.addEventListener('change', (e)=>{ bet = parseFloat(e.target.value); updateTotalsUI(); });

  // Paytable modal
  paytableToggle.addEventListener('click', ()=>{
    paytableModal.classList.remove('hidden');
  });
  closeModal.addEventListener('click', ()=>{
    paytableModal.classList.add('hidden');
  });
  paytableModal.addEventListener('click', (e)=>{
    if(e.target === paytableModal){
      paytableModal.classList.add('hidden');
    }
  });
}

function renderPayGrid(){
  const paygrid = document.getElementById('paygrid');
  if(!paygrid) return;
  paygrid.innerHTML = '';
  Object.keys(PAYTABLE).forEach(sym => {
    const item = document.createElement('div');
    item.className = 'pay-item';
    const spec = PAYTABLE[sym];
    item.innerHTML = `<div style="font-size:22px">${sym} &nbsp; ${symbolName(sym)}</div>
      <div style="margin-top:6px">5: ${(spec[5] || 0).toFixed(2)}× &nbsp; 8: ${(spec[8] || 0).toFixed(2)}× &nbsp; 11: ${(spec[11] || 0).toFixed(2)}× &nbsp; 15+: ${(spec[15] || 0).toFixed(2)}×</div>`;
    paygrid.appendChild(item);
  });
}

function symbolName(sym){
  const s = SYMBOLS.find(x => x.id===sym); return s? s.name : sym;
}

// tiny audio
function tone(freq,duration=0.08,type='sine',vol=0.15){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol; o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    o.stop(ctx.currentTime + duration + 0.02);
  }catch(e){}
}
function playWin(){ tone(880,0.12,'triangle',0.2); setTimeout(()=>tone(1100,0.12,'sine',0.22),120); }
function playLose(){ tone(200,0.3,'sine',0.25); }
function playDeal(){ tone(300,0.05,'square',0.08); }

// init & first render
init();
fillGridRandom();
syncGridDOM();
