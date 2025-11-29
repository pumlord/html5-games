// simulate.js
// High-accuracy simulator derived from your slot.js logic.
// Usage: node simulate.js [spins=100000] [bet=1]

const ARGS = process.argv.slice(2);
const TOTAL_SPINS = parseInt(ARGS[0], 10) || 100000;
const BASE_BET = parseFloat(ARGS[1]) || 1;

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

// === Pools ===
let symbolPool = [];        // includes scatters
let nonScatterPool = [];    // excludes scatters

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
  if(nonScatterPool.length === 0){
    nonScatterPool = SYMBOLS.filter(x=>x.id!=='🎁').map(x=>x.id);
  }
}

function randFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randSymbol(){ return randFrom(symbolPool); }        // can spawn scatter
function randNonScatterSymbol(){ return randFrom(nonScatterPool); } // no scatter

// ---------- core engine (no DOM, no animation) ----------
function makeEmptyGrid(){
  const g = Array.from({length: ROWS}, ()=>Array(COLS).fill(null));
  return g;
}

function countScattersInGrid(grid){
  let count = 0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(grid[r][c] === '🎁') count++;
  return count;
}

// Replace all scatter symbols with non-scatter symbols (before cascade)
function removeScattersBeforeCascade(grid){
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      if(grid[r][c] === '🎁'){
        grid[r][c] = randNonScatterSymbol();
      }
    }
  }
}

// find clusters (4-directional)
function findClusters(grid){
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

function evaluateClusters(grid, tileMult, bet){
  let totalWin = 0;
  const detonations = [];
  const clusterPays = [];

  const clusters = findClusters(grid);
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
        cl.cells.forEach(cell => detonations.push({r: cell.r, c: cell.c}));
      }
    }
    // scatters are ignored for cluster payouts (handled earlier)
  });

  return { totalWin, detonations, clusterPays };
}

// apply detonations -> collapse columns and refill using non-scatter pool
function applyDetonationsSync(grid, detList){
  const toRemove = Array.from({length:ROWS}, ()=>Array(COLS).fill(false));
  detList.forEach(({r,c}) => toRemove[r][c] = true);

  // Build new grid after collapse
  const newGrid = Array.from({length:ROWS}, ()=>Array(COLS).fill(null));

  for(let c=0;c<COLS;c++){
    const col = [];
    // Collect surviving symbols from bottom to top
    for(let r=ROWS-1;r>=0;r--){
      if(!toRemove[r][c]){
        col.push(grid[r][c]);
      }
    }
    // Add new symbols to fill the column (from non-scatter pool)
    const newSymbolsCount = ROWS - col.length;
    for(let i=0; i<newSymbolsCount; i++){
      col.push(randNonScatterSymbol());
    }
    // Write back to newGrid (bottom to top)
    for(let r=ROWS-1, i=0; r>=0; r--, i++){
      newGrid[r][c] = col[i];
    }
  }

  // Copy newGrid into grid (in place)
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      grid[r][c] = newGrid[r][c];
    }
  }
}

// increase multipliers on detonated tiles (persist for current spin/free-spins)
// NOTE: tileMult is per-coordinate and is NOT shifted during cascade (keeps original behavior)
function increaseTileMultipliers(tileMult, detList){
  detList.forEach(({r,c})=>{
    tileMult[r][c] = (tileMult[r][c] || 1) + 1;
  });
}

// Performs a single spin (base or free). Returns: { spinWin, triggeredBonus, awardedFreeSpins }
function performSingleSpin(bet, state){
  // state: { grid, tileMult, freeSpins, ... } - mutate in place
  // Generate final grid: allow scatters here
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      state.grid[r][c] = randSymbol();
    }
  }

  // Count scatters now (pre-cascade)
  const scatterCount = countScattersInGrid(state.grid);

  // If scatters present -> award free spins per rules (before cascade)
  let awarded = 0;
  let triggeredBonus = false;
  if(scatterCount >= 3){
    awarded = (scatterCount === 3)? 10 : (scatterCount === 4)? 12 : (scatterCount === 5)? 15 : (scatterCount === 6)? 20 : 25;
    state.freeSpins += awarded;
    triggeredBonus = true;
  }

  // REMOVE ALL SCATTERS BEFORE CASCADES
  if(scatterCount > 0){
    removeScattersBeforeCascade(state.grid);
  }

  // Cascading + evaluate clusters
  let spinWin = 0;
  let cascadeCount = 0;

  while(true){
    cascadeCount++;
    const evalRes = evaluateClusters(state.grid, state.tileMult, bet);

    if(evalRes.totalWin > 0){
      // increase multipliers on exploded tiles
      increaseTileMultipliers(state.tileMult, evalRes.detonations);
      spinWin += evalRes.totalWin;
      // apply detonations (collapse + refill)
      applyDetonationsSync(state.grid, evalRes.detonations);
      // NOTE: tileMult array is NOT shifted — matches original behaviour where tileMult is per-position
      continue;
    } else {
      // No paying clusters this cascade.
      break;
    }
  }

  return { spinWin, triggeredBonus, awardedFreeSpins: awarded, scatterCount };
}

// full spin sequence called from simulator:
// This mirrors the behaviour in your UI code:
// - For a base spin we subtract bet and reset tile multipliers if freeSpins === 0
// - If base spin awards free spins, they are executed immediately (and free spins can retrigger)
function spinSequence(bet, state, stats){
  // state has grid, tileMult, freeSpins
  // stats will accumulate outcomes

  // Deduct bet for base spins (not for free spins)
  if(!state.currentIsFree){
    state.balance -= bet;
    stats.totalBet += bet;
  }

  // Reset multipliers when starting a fresh paid spin and no pending free spins
  if(!state.currentIsFree && state.freeSpins === 0){
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) state.tileMult[r][c] = 1;
  }

  // run the single spin
  const res = performSingleSpin(bet, state);
  stats.totalPayout += res.spinWin;
  if(res.spinWin > 0){
    stats.hits++;
  }
  // record base spin wins (includes cascade winnings)
  if(!state.currentIsFree){
    stats.baseWins.push(res.spinWin);
  }

  // If a base spin triggered free spins, run them immediately (with retriggers allowed)
  if(res.triggeredBonus && !state.currentIsFree){
    stats.bonusTriggers++;
    stats.bonusTriggerByScatter[res.scatterCount] = (stats.bonusTriggerByScatter[res.scatterCount]||0) + 1;

    // consume free spins loop
    let accruedBonusWin = 0;
    while(state.freeSpins > 0){
      // run each free spin
      state.freeSpins--;
      // mark current spin as free for internal logic
      state.currentIsFree = true;
      const freeRes = performSingleSpin(bet, state);
      accruedBonusWin += freeRes.spinWin;
      stats.totalPayout += freeRes.spinWin;
      if(freeRes.spinWin > 0) stats.bonusHits++;
      // if this free spin retriggers more free spins, it has already added to state.freeSpins by performSingleSpin
      // loop continues until none left
      // After each free spin, we reset currentIsFree to true (still in free loop) — kept as true
    }
    // exit free spin mode
    state.currentIsFree = false;
    stats.bonusWins.push(accruedBonusWin);
  }

  return res.spinWin;
}

// -----------------------------
// Simulation loop
// -----------------------------
function simulate(totalSpins, bet){
  buildSymbolPools();

  // initial state
  const state = {
    grid: makeEmptyGrid(),
    tileMult: Array.from({length:ROWS}, ()=>Array(COLS).fill(1)),
    freeSpins: 0,
    balance: 0,
    currentIsFree: false
  };

  // Fill initial grid with non-scatters (like your fillGridRandom)
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      state.grid[r][c] = randNonScatterSymbol();
    }
  }

  // statistics
  const stats = {
    spinsRun: 0,
    totalBet: 0,
    totalPayout: 0,
    hits: 0,                // spins with non-zero win (base + free included)
    baseWins: [],          // individual base-spin total wins (cascade payout)
    bonusTriggers: 0,      // number of base spins that triggered bonus
    bonusWins: [],         // total payout inside each triggered bonus (sum of all free spins inside that trigger)
    bonusHits: 0,
    bonusTriggerByScatter: {} // map scatterCount -> triggers
  };

  for(let i=0;i<totalSpins;i++){
    stats.spinsRun++;
    // each iteration we do one *base* spin and consume any auto-triggered free spins as per game logic
    spinSequence(bet, state, stats);
  }

  // derive summary
  const rtp = (stats.totalPayout / stats.totalBet) * 100;
  const bonusFrequency = stats.bonusTriggers / stats.spinsRun;
  const avgBonusWin = stats.bonusWins.length ? (stats.bonusWins.reduce((a,b)=>a+b,0) / stats.bonusWins.length) : 0;
  const avgPayoutPerSpin = stats.totalPayout / stats.spinsRun;
  const hitRate = stats.hits / stats.spinsRun;

  // bonus distribution by scatter count
  const byScatter = {};
  Object.keys(stats.bonusTriggerByScatter).forEach(k=>{
    byScatter[k] = stats.bonusTriggerByScatter[k];
  });

  const maxBonusWin = stats.bonusWins.length ? Math.max(...stats.bonusWins) : 0;
  const maxBaseWin = stats.baseWins.length ? Math.max(...stats.baseWins) : 0;

  return {
    stats,
    summary: {
      totalSpins: stats.spinsRun,
      totalBet: stats.totalBet,
      totalPayout: stats.totalPayout,
      rtp,
      avgPayoutPerSpin,
      hitRate,
      bonusFrequency, // fraction
      avgBonusWin,
      bonusTriggers: stats.bonusTriggers,
      bonusesObserved: stats.bonusWins.length,
      maxBonusWin,
      maxBaseWin,
      byScatter
    }
  };
}

// Run
console.time('simulate');
const result = simulate(TOTAL_SPINS, BASE_BET);
console.timeEnd('simulate');

const s = result.summary;
console.log('-------------------- SIMULATION SUMMARY --------------------');
console.log(`Spins simulated:        ${s.totalSpins}`);
console.log(`Total bet placed:       ${s.totalBet.toFixed(4)}`);
console.log(`Total payout:           ${s.totalPayout.toFixed(4)}`);
console.log(`RTP (estimate):         ${s.rtp.toFixed(4)}%`);
console.log(`Avg payout / spin:      ${s.avgPayoutPerSpin.toFixed(6)}`);
console.log(`Hit rate (any win):     ${(s.hitRate*100).toFixed(3)}%`);
console.log(`Bonus triggers:         ${s.bonusTriggers}`);
console.log(`Bonus frequency:        ${(s.bonusFrequency*100).toFixed(6)}%  (1 in ${(s.bonusFrequency>0?(1/s.bonusFrequency).toFixed(1):'∞')} spins)`);
console.log(`Average bonus win:      ${s.avgBonusWin.toFixed(4)} (currency units)`);
console.log(`Max bonus win observed: ${s.maxBonusWin.toFixed(4)}`);
console.log(`Max base-spin win obs:  ${s.maxBaseWin.toFixed(4)}`);
console.log('Bonus triggers by scatter count:', s.byScatter);
console.log('------------------------------------------------------------');

// Optionally produce a small histogram summary for bonus wins:
if(result.stats.bonusWins.length){
  const wins = result.stats.bonusWins.slice().sort((a,b)=>a-b);
  const sum = wins.reduce((a,b)=>a+b,0);
  const mean = sum / wins.length;
  let below1x = wins.filter(x => x < BASE_BET * 1).length;
  let between1_10 = wins.filter(x => x >= BASE_BET*1 && x < BASE_BET*10).length;
  let between10_100 = wins.filter(x => x >= BASE_BET*10 && x < BASE_BET*100).length;
  let over100 = wins.filter(x => x >= BASE_BET*100).length;
  console.log('Bonus win buckets (currency):');
  console.log(` <1x bet: ${below1x} (${(below1x/wins.length*100).toFixed(2)}%)`);
  console.log(` 1x-10x:  ${between1_10} (${(between1_10/wins.length*100).toFixed(2)}%)`);
  console.log(` 10x-100x: ${between10_100} (${(between10_100/wins.length*100).toFixed(2)}%)`);
  console.log(` 100x+:    ${over100} (${(over100/wins.length*100).toFixed(2)}%)`);
}

