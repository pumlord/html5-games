const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

ctx.strokeStyle = 'blue';
ctx.lineWidth = 2;

// Game state
let curvePoints = [];
let animFrame = null; // Changed from gameLoop to animFrame for RAF
let balance = 1000;
let crashed = false;
let betAmount = 0;
let profitsTaken = false;
let rocketPosition = { x: 0, y: 0 };
let currentMultiplier = 1.00;
let crashPoint = 1.00;
let startTime = null; // Track actual start timestamp
let elapsedTime = 0; // Will be calculated from timestamp, not incremented

const balanceDisplay = document.getElementById('balance');
balanceDisplay.innerText = balance.toFixed(2);

const betAmountInput = document.getElementById('bet-amount');
const resetBtn = document.getElementById('reset');
const submitBtn = document.getElementById('start-game');
const cashOutBtn = document.getElementById('cash-out');
const messageEl = document.getElementById('message');

// Audio context (created only after user interaction to avoid autoplay block)
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Play simple tone using Web Audio API
function playTone(frequency = 440, duration = 150, type = 'sine') {
  initAudio();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  gain.gain.setValueAtTime(0.15, audioCtx.currentTime); // Volume
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration / 1000);

  osc.start();
  osc.stop(audioCtx.currentTime + duration / 1000);
}

// Positive cashout sound
function playWinSound() {
  playTone(880, 120, 'sine');     // high beep
  setTimeout(() => playTone(1200, 120, 'sine'), 120);  // rising second beep
}

// Crash sound
function playCrashSound() {
  playTone(200, 200, 'square');  // low thud tone
}

// Generate crash point with 96% RTP - CORRECTED FORMULA
function generateCrashPoint() {
  const houseEdge = 0.04; // 4% house edge = 96% RTP
  const r = Math.random();

  // CORRECT METHOD: Generate fair multiplier first, then apply house edge
  // Step 1: Fair multiplier using inverse transform sampling
  const fair = 1 / (1 - r);

  // Step 2: Apply house edge by scaling down the fair multiplier
  const crash = fair * (1 - houseEdge);

  // Round to 2 decimals and cap at 1000x
  const rounded = Math.floor(crash * 100) / 100;
  return Math.min(rounded, 1000);
}

// Calculate current multiplier based on elapsed time
// Starts slow, accelerates gradually
function calculateMultiplier(timeMs) {
  // Exponential growth: mult = e^(k*t) where k controls growth rate
  // Adjusted to start at 1.00x and grow gradually
  const k = 0.0012; // Growth rate constant (increased for better pacing)
  const mult = Math.exp(k * timeMs); // Using Math.exp instead of Math.pow(Math.E, ...)
  return Math.max(1, mult); // Ensure minimum 1.00x
}

function updateCurve() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();

  for (let i = 0; i < curvePoints.length; i++) {
    const { x, y } = curvePoints[i];
    ctx.lineTo(x, y);
  }

  ctx.stroke();

  if (!crashed) {
    const lastPoint = curvePoints[curvePoints.length - 1];

    if (curvePoints.length >= 2) {
      const secondLastPoint = curvePoints[curvePoints.length - 2];
      const deltaX = lastPoint.x - secondLastPoint.x;
      const deltaY = lastPoint.y - secondLastPoint.y;
      const angle = Math.atan2(deltaY, deltaX) + Math.PI / 4;

      ctx.save();
      ctx.translate(lastPoint.x, lastPoint.y);
      ctx.rotate(angle);

      ctx.font = '30px Arial';
      ctx.fillText('🚀', 0, -10);

      rocketPosition = {
        x: lastPoint.x,
        y: lastPoint.y
      };

      ctx.restore();
    } else {
      ctx.font = '30px Arial';
      ctx.fillText('🚀', lastPoint.x, lastPoint.y - 10);

      rocketPosition = {
        x: lastPoint.x,
        y: lastPoint.y
      };
    }
  } else {
    const crashPosition = {
      x: rocketPosition.x,
      y: rocketPosition.y - 10
    };

    if (curvePoints.length >= 2) {
      const crashAngle = Math.atan2(rocketPosition.y - curvePoints[curvePoints.length - 2].y, rocketPosition.x - curvePoints[curvePoints.length - 2].x) + Math.PI / 4;

      ctx.save();
      ctx.translate(crashPosition.x, crashPosition.y);
      ctx.rotate(crashAngle);

      ctx.font = '30px Arial';
      ctx.fillText('💥', 0, 0);

      ctx.restore();
    }
  }
}

// NEW: Compute Y position using logarithmic scaling (more natural for exponential growth)
function computeY(mult) {
  const canvasH = canvas.height;
  const marginTop = 20;
  const marginBottom = 0; // Changed from 40 to 0 so rocket starts at bottom
  const usable = canvasH - marginTop - marginBottom;

  // Use logarithmic scaling for smooth visual progression
  const ln = Math.log(Math.max(mult, 1));
  const scale = Math.min(ln / Math.log(10), 5); // Limit growth for very large mults

  // Invert y: larger mult => smaller y (upwards)
  const y = canvasH - marginBottom - (scale / 5) * usable;
  return Math.max(marginTop, Math.min(canvasH - marginBottom, y));
}

function updateCurvePoints(timestamp) {
  // Use actual timestamp instead of manual increment
  if (!startTime) startTime = timestamp;
  elapsedTime = timestamp - startTime; // Accurate elapsed time

  currentMultiplier = calculateMultiplier(elapsedTime);

  // Update display
  document.getElementById('currentMultiplier').innerText = currentMultiplier.toFixed(2) + 'x';

  // Calculate curve position using improved logarithmic Y calculation
  const x = elapsedTime / 20; // Horizontal speed
  const y = computeY(currentMultiplier); // NEW: Logarithmic Y scaling

  curvePoints.push({ x, y });

  // Redraw the canvas with new curve points
  updateCurve();

  // Check if we've reached crash point
  if (currentMultiplier >= crashPoint) {
    crashCurve();
    return; // Stop here
  }

  // Continue animation loop
  animFrame = requestAnimationFrame(updateCurvePoints);
}

function startGame() {
  // Generate crash point BEFORE game starts
  crashPoint = generateCrashPoint();

  curvePoints = [{
    x: 0,
    y: computeY(1.00) // Use computeY for consistent positioning
  }];

  elapsedTime = 0;
  startTime = null; // Reset start time for RAF
  currentMultiplier = 1.00;
  crashed = false;
  profitsTaken = false;

  document.getElementById('currentMultiplier').innerText = '1.00x';

  // Enable cash out button, disable start button
  cashOutBtn.disabled = false;
  submitBtn.disabled = true;

  updateCurve();

  // Start animation loop using requestAnimationFrame (RAF)
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(updateCurvePoints);
}


function crashCurve() {
  // Stop animation using cancelAnimationFrame
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  crashed = true;
  if (!profitsTaken) playCrashSound();

  // Re-enable start button, disable cash out button
  submitBtn.disabled = false;
  cashOutBtn.disabled = true;

  const crashValue = currentMultiplier.toFixed(2);
  messageEl.textContent = `Crashed at ${crashValue}x`;

  const crash = document.createElement('p');
  crash.innerText = crashValue + 'x';
  crash.style.color = profitsTaken ? 'lime' : 'red';

  const crashesList = document.getElementById('lastCrashes');
  crashesList.appendChild(crash);

  // Limit to last 8 crashes
  while (crashesList.children.length > 8) {
    crashesList.removeChild(crashesList.firstChild);
  }

  updateCurve();
}

submitBtn.addEventListener('click', function () {
  const betValue = parseFloat(betAmountInput.value);

  // Check if game is already running (use animFrame instead of gameLoop)
  if (balance >= betValue && betValue > 0 && !animFrame) {
    balance = balance - betValue;
    balanceDisplay.innerText = balance.toFixed(2);

    betAmount = betValue;
    messageEl.textContent = '';
    startGame();
  }
});

cashOutBtn.addEventListener('click', function () {
  // Check if game is running (use animFrame instead of gameLoop)
  if (!crashed && !profitsTaken && animFrame) {
    profitsTaken = true;
    playWinSound();

    const profit = betAmount * currentMultiplier;

    balance = parseFloat((balance + profit).toFixed(2));
    balanceDisplay.innerText = balance.toFixed(2);

    // Stop the game using cancelAnimationFrame
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    crashed = true; // Treat as ended

    // Re-enable start button, disable cash out button
    submitBtn.disabled = false;
    cashOutBtn.disabled = true;

    messageEl.textContent = `Cashed out at ${currentMultiplier.toFixed(2)}x`;

    // Add to crashes list
    const crash = document.createElement('p');
    crash.innerText = currentMultiplier.toFixed(2) + 'x';
    crash.style.color = 'lime';

    const crashesList = document.getElementById('lastCrashes');
    crashesList.appendChild(crash);

    // Limit to last 8 crashes
    while (crashesList.children.length > 8) {
      crashesList.removeChild(crashesList.firstChild);
    }
  }
});

resetBtn.addEventListener('click', function() {
  balance = 1000;
  balanceDisplay.innerText = balance.toFixed(2);
  document.getElementById('crashedAt').textContent = '';
});
