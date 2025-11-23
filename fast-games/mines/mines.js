// ======= Global Variables =======
let balance = 1000;
let gameActive = false;
let gameEnded = false;
let mines = [];
let revealedCount = 0;
let totalSafe = 0;
let bet = 0;
let autoGameActive = false;
let autoGameRounds = 0;
let autoGameCurrentRound = 0;

// ======= DOM Elements =======
const boardEl = document.getElementById("board");
const balanceEl = document.getElementById("balance");
const betAmountEl = document.getElementById("bet-amount");
const minesCountEl = document.getElementById("mines-count");
const minesValueEl = document.getElementById("mines-value");
const startGameBtn = document.getElementById("start-game");
const cashOutBtn = document.getElementById("cash-out");
const resetBtn = document.getElementById("reset-btn");
const messageEl = document.getElementById("message");
const randomBtn = document.getElementById("random-btn");
const autoGameToggle = document.getElementById("auto-game-toggle");
const autoGameModal = document.getElementById("auto-game-modal");
const roundBtns = document.querySelectorAll(".round-btn");
const cancelAutoGameBtn = document.getElementById("cancel-auto-game");

// ======= Initial Setup =======
createBoard();
updateMinesSliderLabel();

// ======= Event Listeners =======
minesCountEl.addEventListener("input", updateMinesSliderLabel);
startGameBtn.addEventListener("click", startGame);
cashOutBtn.addEventListener("click", cashOut);
resetBtn.addEventListener("click", resetBalance);
randomBtn.addEventListener("click", randomClick);
autoGameToggle.addEventListener("change", toggleAutoGame);
roundBtns.forEach(btn => btn.addEventListener("click", selectRounds));
cancelAutoGameBtn.addEventListener("click", cancelAutoGame);

// ======= RTP & Max Caps =======
const RTP = 0.96;
const maxCaps = { 1: 15, 2: 25, 3: 35, 4: 45, 5: 50 };

// ======= Sound Setup =======
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, duration = 0.2, type = "sine") {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = type;
    oscillator.frequency.value = freq;
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

function playDiamond() {
    playTone(880, 0.15, "triangle");
}

function playBomb() {
    playTone(150, 0.1, "sawtooth");
    setTimeout(() => playTone(100, 0.1, "sawtooth"), 50);
    setTimeout(() => playTone(80, 0.2, "sawtooth"), 120);
}

// ======= Shimmer Sequence for Diamonds =======
let shimmerQueue = [];
let shimmerPlaying = false;

function playShimmerSequence() {
    if (shimmerPlaying || shimmerQueue.length === 0) return;

    shimmerPlaying = true;
    const note = shimmerQueue.shift();

    playTone(note.freq, note.dur, note.type);

    setTimeout(() => {
        shimmerPlaying = false;
        playShimmerSequence();
    }, note.dur * 1000 + 20);
}

function enqueueShimmer(count = 3) {
    for (let i = 0; i < count; i++) {
        shimmerQueue.push({
            freq: 800 + i * 120,
            dur: 0.08,
            type: "triangle",
        });
    }
    playShimmerSequence();
}

// ======= Multiplier Calculation (Probability-Based) =======
function calculateMultiplier(minesCount, revealedCount) {
  const totalSafe = 25 - minesCount;
  let multiplier = 1;

  for (let i = 0; i < revealedCount; i++) {
    const safeLeft = totalSafe - i;
    const totalLeft = 25 - i;
    const stepProb = safeLeft / totalLeft;
    const stepMult = (1 / stepProb) * RTP;
    multiplier *= stepMult;

    if (multiplier > maxCaps[minesCount]) {
      multiplier = maxCaps[minesCount];
      break;
    }
  }

  return multiplier;
}

// ======= Functions =======
function createBoard() {
  boardEl.innerHTML = "";
  for (let i = 0; i < 25; i++) {
    const flipCard = document.createElement("div");
    flipCard.classList.add("flip-card");
    flipCard.dataset.index = i;

    const flipCardInner = document.createElement("div");
    flipCardInner.classList.add("flip-card-inner");

    const flipCardFront = document.createElement("div");
    flipCardFront.classList.add("flip-card-front");
    flipCardFront.textContent = "?";

    const flipCardBack = document.createElement("div");
    flipCardBack.classList.add("flip-card-back");

    flipCardInner.appendChild(flipCardFront);
    flipCardInner.appendChild(flipCardBack);
    flipCard.appendChild(flipCardInner);

    flipCard.addEventListener("click", onCellClick);
    boardEl.appendChild(flipCard);
  }
}

function updateMinesSliderLabel() {
  minesValueEl.textContent = minesCountEl.value;
}

function startGame() {
  if (gameEnded) resetBoard();

  bet = parseFloat(betAmountEl.value);
  if (isNaN(bet) || bet <= 0) return showMessage("Please enter a valid bet.");
  if (bet > balance) return showMessage("Not enough balance.");

  balance -= bet;
  updateBalance();

  const mineCount = parseInt(minesCountEl.value);
  mines = generateMines(mineCount);
  revealedCount = 0;
  totalSafe = 25 - mineCount;
  gameActive = true;
  gameEnded = false;

  const flipCards = boardEl.querySelectorAll(".flip-card");
  flipCards.forEach(card => {
    card.classList.remove("flipped");
    const backFace = card.querySelector(".flip-card-back");
    backFace.textContent = "";
    backFace.className = "flip-card-back";
  });

  startGameBtn.disabled = true;
  cashOutBtn.disabled = false;
  randomBtn.disabled = false;

  if (autoGameActive) {
    showMessage(`Auto Game: Round ${autoGameCurrentRound + 1}/${autoGameRounds}`);
    playAutoGame();
  } else {
    showMessage(`Game started! ${totalSafe} safe cells to find.`);
  }
}

function resetBoard() {
  const flipCards = boardEl.querySelectorAll(".flip-card");
  flipCards.forEach(card => {
    card.classList.remove("flipped");
    const backFace = card.querySelector(".flip-card-back");
    backFace.textContent = "";
    backFace.className = "flip-card-back";
  });

  gameActive = false;
  gameEnded = false;
  mines = [];
  revealedCount = 0;
  totalSafe = 0;

  startGameBtn.disabled = false;
  cashOutBtn.disabled = true;
  randomBtn.disabled = true;
}

function generateMines(count) {
  const minePositions = [];
  while (minePositions.length < count) {
    const pos = Math.floor(Math.random() * 25);
    if (!minePositions.includes(pos)) minePositions.push(pos);
  }
  return minePositions;
}



function onCellClick(e) {
  if (!gameActive) return;

  const flipCard = e.target.closest(".flip-card");
  if (!flipCard) return;

  if (flipCard.classList.contains("flipped")) return;

  const index = parseInt(flipCard.dataset.index);
  const minesCount = parseInt(minesCountEl.value);

  const backFace = flipCard.querySelector(".flip-card-back");

  flipCard.classList.add("flipped");

  if (mines[index]) {
    backFace.textContent = "💣";
    backFace.classList.add("mine");
    playBomb();

    setTimeout(() => {
      endGame(false);
    }, 300);
  } else {
    backFace.textContent = "💎";
    backFace.classList.add("safe");
    revealedCount++;
    playDiamond();
    enqueueShimmer();

    const multiplier = calculateMultiplier(minesCount, revealedCount);
    showMessage(`Safe! Clicks: ${revealedCount} | Multiplier: ${multiplier.toFixed(2)}x`);

    if (revealedCount === totalSafe) {
      setTimeout(() => {
        endGame(true);
      }, 300);
    }
  }
}

function endGame(win) {
  gameActive = false;
  gameEnded = true;

  if (win) {
    const minesCount = parseInt(minesCountEl.value);
    const multiplier = calculateMultiplier(minesCount, revealedCount);
    const payout = bet * multiplier;
    balance += payout;
    updateBalance();
    showMessage(`🎉 You won $${payout.toFixed(2)} (x${multiplier.toFixed(2)})!`);
  } else {
    showMessage(`💣 Game Over! Lost $${bet.toFixed(2)}`);
  }

  startGameBtn.disabled = false;
  cashOutBtn.disabled = true;
  randomBtn.disabled = true;

  if (autoGameActive) {
    autoGameCurrentRound++;

    if (autoGameCurrentRound < autoGameRounds) {
      // Continue to next round
      setTimeout(() => {
        resetBoard();
        startGame();
      }, 1500);
    } else {
      // All rounds completed
      setTimeout(() => {
        resetBoard();
        autoGameActive = false;
        autoGameToggle.checked = false;
        betAmountEl.disabled = false;
        minesCountEl.disabled = false;
        showMessage(`Auto Game completed! ${autoGameRounds} rounds finished.`);
      }, 1500);
    }
  }
}

function cashOut() {
  if (!gameActive) return;

  const minesCount = parseInt(minesCountEl.value);
  const multiplier = calculateMultiplier(minesCount, revealedCount);
  const payout = bet * multiplier;
  balance += payout;
  updateBalance();

  gameActive = false;
  gameEnded = true;

  showMessage(`💰 Cashed out $${payout.toFixed(2)} (x${multiplier.toFixed(2)})!`);

  startGameBtn.disabled = false;
  cashOutBtn.disabled = true;
}

function updateBalance() {
  balanceEl.textContent = balance.toFixed(0);
}

function showMessage(msg) {
  messageEl.textContent = msg;
  setTimeout(() => {
    if (messageEl.textContent === msg) messageEl.textContent = '';
  }, 3000);
}

function resetBalance() {
  balance = 1000;
  updateBalance();
  showMessage('Balance reset to $1000');
  if (gameActive || gameEnded) resetBoard();
}

// ======= Random Click Function =======
function randomClick() {
  if (!gameActive) return;

  const flipCards = boardEl.querySelectorAll(".flip-card");
  const unflippedCards = Array.from(flipCards).filter(card => !card.classList.contains("flipped"));

  if (unflippedCards.length === 0) return;

  const randomCard = unflippedCards[Math.floor(Math.random() * unflippedCards.length)];
  randomCard.click();
}

// ======= Auto Game Toggle =======
function toggleAutoGame() {
  if (autoGameToggle.checked) {
    // Show modal to select rounds
    autoGameModal.classList.add('active');
  } else {
    // Disable auto game
    autoGameActive = false;
    autoGameRounds = 0;
    autoGameCurrentRound = 0;

    if (!gameActive) {
      startGameBtn.disabled = false;
    }
    betAmountEl.disabled = false;
    minesCountEl.disabled = false;
    showMessage('Auto Game disabled.');
  }
}

// ======= Select Rounds =======
function selectRounds(e) {
  const rounds = parseInt(e.target.dataset.rounds);
  autoGameRounds = rounds;
  autoGameCurrentRound = 0;
  autoGameActive = true;

  // Close modal
  autoGameModal.classList.remove('active');

  // Disable controls
  startGameBtn.disabled = false;
  betAmountEl.disabled = true;
  minesCountEl.disabled = true;

  showMessage(`Auto Game: ${rounds} rounds selected. Click Bet to start.`);
}

// ======= Cancel Auto Game =======
function cancelAutoGame() {
  // Close modal
  autoGameModal.classList.remove('active');

  // Uncheck toggle
  autoGameToggle.checked = false;

  // Reset auto game
  autoGameActive = false;
  autoGameRounds = 0;
  autoGameCurrentRound = 0;

  showMessage('Auto Game cancelled.');
}

// ======= Auto Game Play =======
function playAutoGame() {
  if (!autoGameActive || !gameActive) return;

  const minesCount = parseInt(minesCountEl.value);
  const targetClicks = 25 - minesCount;

  const flipCards = boardEl.querySelectorAll(".flip-card");
  const unflippedCards = Array.from(flipCards).filter(card => !card.classList.contains("flipped"));

  let clickCount = 0;
  const clickInterval = setInterval(() => {
    if (!gameActive || clickCount >= targetClicks || unflippedCards.length === 0) {
      clearInterval(clickInterval);
      return;
    }

    const availableCards = Array.from(flipCards).filter(card => !card.classList.contains("flipped"));
    if (availableCards.length === 0) {
      clearInterval(clickInterval);
      return;
    }

    const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
    const index = parseInt(randomCard.dataset.index);
    const backFace = randomCard.querySelector(".flip-card-back");

    randomCard.classList.add("flipped");

    if (mines[index]) {
      backFace.textContent = "💣";
      backFace.classList.add("mine");
      playBomb();
      clearInterval(clickInterval);
      setTimeout(() => {
        endGame(false);
      }, 300);
    } else {
      backFace.textContent = "💎";
      backFace.classList.add("safe");
      revealedCount++;
      clickCount++;
      playDiamond();
      enqueueShimmer();

      const multiplier = calculateMultiplier(minesCount, revealedCount);
      showMessage(`Auto: ${revealedCount}/${targetClicks} | Multiplier: ${multiplier.toFixed(2)}x`);

      if (revealedCount === totalSafe) {
        clearInterval(clickInterval);
        setTimeout(() => {
          endGame(true);
        }, 300);
      }
    }
  }, 200);
}
