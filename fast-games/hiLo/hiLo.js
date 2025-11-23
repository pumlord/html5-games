// ======== GLOBALS =========
let balance = 1000.00;
let deck = [];
let current = null; // {rank,label,suit}
let bet = 10;
let cumulativeMultiplier = 1.0;
let gameActive = false;

const RTP = 0.96;

// ======== DOM =========
function findEl(id, ...alts){
  let el = document.getElementById(id);
  if(el) return el;
  for(const s of alts){
    try{ el = document.querySelector(s); }catch(e){}
    if(el) { console.warn(`findEl: used fallback selector '${s}' for '${id}'`); return el }
  }
  console.error(`findEl: element '${id}' not found (checked ${[id,...alts].join(', ')})`);
  return null;
}

const balanceEl = findEl('balance');
const betAmountEl = findEl('bet-amount', 'input[name="bet-amount"]', 'input[type=number]');
// start button: try common alternative ids
const startBtn = findEl('start-game', '#start', 'button[data-start]');
const cashoutBtn = findEl('cash-out', '#cashout', 'button[data-cashout]');
const resetBtn = findEl('reset');
const messageEl = findEl('message');

const deckStackEl = findEl('deck-stack');
const cardEl = findEl('card');
const cardInner = cardEl ? cardEl.querySelector('.card-inner') : null;
const cardFront = cardEl ? cardEl.querySelector('.card-front') : null;
const cardBack = cardEl ? cardEl.querySelector('.card-back') : null;
const prevHolder = findEl('prev-holder');

const higherBtn = findEl('higher-btn');
const sameBtn = findEl('same-btn');
const lowerBtn = findEl('lower-btn');

const stepHigherEl = findEl('step-higher');
const stepSameEl = findEl('step-same');
const stepLowerEl = findEl('step-lower');

// If critical elements are missing, log a summarized hint for debugging
if(!startBtn) console.error('HiLo init: start button not found; clicks will not be bound.');
if(!balanceEl) console.error('HiLo init: balance display not found.');

// ======== UTILITIES =========
// Rank labels & suits
const RANK_LABEL = {11:'J',12:'Q',13:'K',14:'A'};
const SUITS = ['♠','♥','♦','♣'];
function rankLabel(n){ return RANK_LABEL[n] || String(n); }

// Build + shuffle deck
function buildDeck(){
  const ranks = [2,3,4,5,6,7,8,9,10,11,12,13,14];
  const arr=[];
  for(const r of ranks) for(const s of SUITS) arr.push({rank:r,label:rankLabel(r),suit:s});
  return arr;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { 
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]; 
  } 
}

function drawCard(){ 
  return deck.pop() || null 
}

function formatCard(c){ 
  return `${c.label}${c.suit}` 
}

// Audio (simple tone generator for wins/loses)
let audioCtx = null;
try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
function playTone(freq=440, dur=0.12, type='sine'){
  try{
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const now=audioCtx.currentTime;
    g.gain.linearRampToValueAtTime(0.12, now+0.01);
    o.start(now);
    g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
    o.stop(now+dur+0.02);
  }catch(e){}
}
const playWin = ()=>{ playTone(880,0.12); playTone(1320,0.08); };
const playLose = ()=> playTone(220,0.18,'sawtooth');
const playCash = ()=>{ playTone(660,0.1,'triangle'); playTone(880,0.08); };

// UI helpers
function updateBalance(){ balanceEl.textContent = balance.toFixed(2); }
function showMessage(txt, t=2500){
  messageEl.textContent = txt;
  if(t>0) setTimeout(()=>{ if(messageEl.textContent===txt) messageEl.textContent=''; }, t);
}

function hideCardFace(){
  cardEl.classList.remove('flipped');
  cardFront.textContent = '?';
  cardBack.innerHTML = '';
}

function populateCardBack(card){
  cardBack.innerHTML = `
    <div class="rank">${card.label}</div>
    <div class="suit ${card.suit==='♥'||card.suit==='♦'?'red':'black'}">${card.suit}</div>
  `;
}

function revealCardVisual(card){
  populateCardBack(card);
  requestAnimationFrame(()=> cardEl.classList.add('flipped'));
}

// Animate new card from deck to main card slot
function animateDealFromDeck(card, onComplete) {
  const temp = document.createElement('div');
  temp.className = 'card deal-temp';
  temp.innerHTML = `
    <div class="card-inner">
      <div class="card-front">?</div>
      <div class="card-back">
        <div class="rank">${card.label}</div>
        <div class="suit ${card.suit==='♥'||card.suit==='♦'?'red':'black'}">${card.suit}</div>
      </div>
    </div>
  `;

  const deckRect = deckStackEl.getBoundingClientRect();
  const targetRect = cardEl.getBoundingClientRect();

  temp.style.position = 'fixed';
  temp.style.left = deckRect.left + 'px';
  temp.style.top = deckRect.top + 'px';
  temp.style.width = deckRect.width + 'px';
  temp.style.height = deckRect.height + 'px';
  temp.style.zIndex = 9999;
  temp.style.transform = 'rotateY(0deg)';
  temp.style.transition = 'all 0.55s cubic-bezier(.4,0,.2,1), transform 0.55s ease';

  document.body.appendChild(temp);

  // Force first frame
  temp.getBoundingClientRect();

  // Slide + flip
  temp.style.left = targetRect.left + 'px';
  temp.style.top = targetRect.top + 'px';
  temp.style.width = targetRect.width + 'px';
  temp.style.height = targetRect.height + 'px';
  temp.style.transform = 'rotateY(180deg)';

  setTimeout(() => {
    document.body.removeChild(temp);
    onComplete();
  }, 560);
}

// Animate previous card fading & sliding out
function animatePrevCard(card){
  const el = document.createElement('div');
  el.className = 'prev-card fade-slide';
  el.textContent = formatCard(card);
  prevHolder.appendChild(el);

  setTimeout(()=> el.classList.add('fade-out'), 50);
  setTimeout(()=> {
    try{ prevHolder.removeChild(el) }catch(e){}
  }, 1200);
}

function pushPrevCard(card){
  if(!card) return;
  animatePrevCard(card);
}

// count logic
function countsRelative(curr){
  let higher=0, lower=0, same=0;
  for(const c of deck){
    if(c.rank > curr.rank) higher++;
    else if(c.rank < curr.rank) lower++;
    else same++;
  }
  return {higher, lower, same, total:deck.length};
}

function stepMultiplier(count, total){
  if(total===0 || count===0) return Infinity;
  return (1/(count/total)) * RTP;   // << FIXED RTP USED HERE
}

function refreshSteps(){
  if(!current){
    stepHigherEl.textContent = '—';
    stepSameEl.textContent = '—';
    stepLowerEl.textContent = '—';
    higherBtn.disabled = true;
    sameBtn.disabled = true;
    lowerBtn.disabled = true;
    return;
  }

  const c = countsRelative(current);

  const sH = stepMultiplier(c.higher,c.total);
  const sL = stepMultiplier(c.lower,c.total);
  const sS = stepMultiplier(c.same,c.total);

  stepHigherEl.textContent = isFinite(sH)? sH.toFixed(3)+'x' : '—';
  stepLowerEl.textContent = isFinite(sL)? sL.toFixed(3)+'x' : '—';
  stepSameEl.textContent = isFinite(sS)? sS.toFixed(3)+'x' : '—';

  higherBtn.disabled = !gameActive || c.higher===0;
  lowerBtn.disabled = !gameActive || c.lower===0;
  sameBtn.disabled = !gameActive || c.same===0;
}

// ====== Start Game ======
startBtn.addEventListener('click', ()=>{
  if(gameActive) return;

  bet = Number(betAmountEl.value) || 10;
  if(bet <= 0) return showMessage('Enter valid bet');
  if(bet > balance) return showMessage('Insufficient balance');

  balance -= bet;
  updateBalance();

  deck = buildDeck();
  shuffle(deck);
  current = drawCard();
  cumulativeMultiplier = 1.0;
  gameActive = true;

  deckStackEl.classList.add('hidden');

  animateDealFromDeck(current, () => revealCardVisual(current));
  refreshSteps();

  cashoutBtn.disabled = false;
  betAmountEl.disabled = true;
  startBtn.disabled = true;

  showMessage('Bet placed — choose Higher / Same / Lower');
});

// ====== Guess ======
async function handleGuess(type, btnEl){
  if(!gameActive) return;

  higherBtn.disabled = true;
  lowerBtn.disabled = true;
  sameBtn.disabled = true;

  const counts = countsRelative(current);
  let winCount = type==='higher'? counts.higher :
                 type==='lower'? counts.lower :
                 counts.same;

  const next = drawCard();
  if(!next){ gameActive=false; return; }

  pushPrevCard(current);
  await new Promise(resolve => {
    animateDealFromDeck(next, () => {
      revealCardVisual(next);
      resolve();
    });
  });

  let won =
    (type==='higher' && next.rank > current.rank) ||
    (type==='lower' && next.rank < current.rank) ||
    (type==='same' && next.rank === current.rank);

  if(won){
    const step = stepMultiplier(winCount, counts.total);
    cumulativeMultiplier *= step;

    btnEl.classList.add('win');
    playWin();
    showMessage(`Win! multiplier x${step.toFixed(3)} — total x${cumulativeMultiplier.toFixed(3)}`);

    setTimeout(()=> btnEl.classList.remove('win'),300);

    current = next;
    refreshSteps();

    if(deck.length > 0){
      const c2 = countsRelative(current);
      higherBtn.disabled = c2.higher===0;
      lowerBtn.disabled = c2.lower===0;
      sameBtn.disabled = c2.same===0;
    } else {
      setTimeout(()=> cashOut(), 350);
    }

  } else {
    btnEl.classList.add('lose');
    playLose();

    showMessage(`Game Over! Lost $${bet.toFixed(2)}`);

    setTimeout(()=> btnEl.classList.remove('lose'),400);

    gameActive=false;
    cashoutBtn.disabled=true;

    setTimeout(()=>{
      setTimeout(()=> hideCardFace(), 900);
      deckStackEl.classList.remove('hidden');
      prevHolder.innerHTML = '';
      betAmountEl.disabled=false;
      startBtn.disabled=false;
    },600);
  }

  updateBalance();
}

higherBtn.addEventListener('click', ()=> handleGuess('higher', higherBtn));
lowerBtn.addEventListener('click', ()=> handleGuess('lower', lowerBtn));
sameBtn.addEventListener('click', ()=> handleGuess('same', sameBtn));

// ====== Cashout ======
cashoutBtn.addEventListener('click', cashOut);

function cashOut(){
  if(!gameActive) return;
  const payout = bet * cumulativeMultiplier;
  balance += payout;

  gameActive = false;
  updateBalance();

  showMessage(`Cashed out $${payout.toFixed(2)} (x${cumulativeMultiplier.toFixed(3)})`);
  playCash();

  hideCardFace();
  deckStackEl.classList.remove('hidden');
  prevHolder.innerHTML = '';

  betAmountEl.disabled = false;
  startBtn.disabled = false;

  cashoutBtn.disabled = true;
  higherBtn.disabled=true;
  lowerBtn.disabled=true;
  sameBtn.disabled=true;
}

// ====== Reset ======
resetBtn.addEventListener('click', ()=>{
  balance = 1000;
  deck = [];
  current = null;
  cumulativeMultiplier = 1;
  gameActive = false;

  hideCardFace();
  deckStackEl.classList.remove('hidden');
  prevHolder.innerHTML = '';

  betAmountEl.disabled = false;
  startBtn.disabled = false;
  cashoutBtn.disabled = true;

  higherBtn.disabled=true;
  lowerBtn.disabled=true;
  sameBtn.disabled=true;

  updateBalance();
  showMessage('Balance reset to $1000');
});

// init
updateBalance();
hideCardFace();
higherBtn.disabled=true;
lowerBtn.disabled=true;
sameBtn.disabled=true;
cashoutBtn.disabled=true;
