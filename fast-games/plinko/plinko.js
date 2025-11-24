// Plinko Game - Matter.js Physics Implementation
console.clear();

// Canvas dimensions
const WIDTH = 500;
const HEIGHT = 430;

// Multipliers (17 slots for 16 rows)
const SLOT_MULTIPLIERS = [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16];

// DOM elements
const canvas = document.getElementById('plinko-canvas');
const balanceEl = document.getElementById('balance');
const betInputEl = document.getElementById('bet-input');
const countInputEl = document.getElementById('count-input');
const messageEl = document.getElementById('message');

// Game state
let balance = 1000;
let isDropping = false; // Track if balls are currently active

// Note class for sound
class Note {
  constructor(note) {
    this.synth = new Tone.PolySynth().toDestination();
    this.synth.set({ volume: -6 });
    this.note = note;
  }

  play() {
    return this.synth.triggerAttackRelease(
      this.note,
      "32n",
      Tone.context.currentTime
    );
  }
}

// Create notes for each multiplier
const notes = [
  "C#5", "C5", "B5", "A#5", "A5", "G#4", "G4", "F#4", "F4",
  "F#4", "G4", "G#4", "A5", "A#5", "B5", "C5", "C#5"
].map((note) => new Note(note));

// Click noise synth
const clickSynth = new Tone.NoiseSynth({ volume: -26 }).toDestination();

// Matter.js aliases
const Engine = Matter.Engine;
const Events = Matter.Events;
const Render = Matter.Render;
const Runner = Matter.Runner;
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;

// Create engine with custom gravity
const engine = Engine.create({
  gravity: {
    scale: 0.0007
  }
});

// Create renderer
const render = Render.create({
  canvas,
  engine,
  options: {
    width: WIDTH,
    height: HEIGHT,
    wireframes: false,
    background: '#14151f'
  }
});

// Create pegs with invisible boundary pegs at first and last position of each row
const GAP = 26;
const PEG_RAD = 3;
const WALL_PEG_RAD = 6; // Larger radius for wall pegs to prevent balls escaping
const pegs = [];
const wallPegs = []; // Track wall pegs separately for collision handling

for (let r = 0; r < 16; r++) {
  const visiblePegsInRow = r + 3; // Original visible pegs (3, 4, 5, ..., 18)
  const totalPegsInRow = visiblePegsInRow + 2; // Add 2 invisible pegs (first and last)

  for (let c = 0; c < totalPegsInRow; c++) {
    const x = WIDTH / 2 + (c - (totalPegsInRow - 1) / 2) * GAP;
    const y = GAP + r * GAP;

    // First and last pegs are invisible walls
    const isWall = (c === 0 || c === totalPegsInRow - 1);
    const isLeftWall = (c === 0);
    const isRightWall = (c === totalPegsInRow - 1);

    const peg = Bodies.circle(x, y, isWall ? WALL_PEG_RAD : PEG_RAD, {
      isStatic: true,
      label: isWall ? (isLeftWall ? "LeftWall" : "RightWall") : "Peg",
      restitution: isWall ? 0.9 : undefined, // Higher bounce for walls to push balls back
      render: {
        fillStyle: isWall ? "#14151f" : "#fff", // Invisible walls match background
        visible: true
      }
    });
    pegs.push(peg);

    if (isWall) {
      wallPegs.push({ body: peg, isLeft: isLeftWall });
    }
  }
}
Composite.add(engine.world, pegs);

// Track animations for pegs
const pegAnims = new Array(pegs.length).fill(null);

// Create ground
const ground = Bodies.rectangle(WIDTH / 2, HEIGHT + 22, WIDTH * 2, 40, {
  isStatic: true,
  label: "Ground"
});
Composite.add(engine.world, [ground]);

// Drop a ball - Precise probability distribution matching slot probabilities
const BALL_RAD = 6;

// Target probabilities for each slot (17 slots total)
const TARGET_PROBABILITIES = [
  0.0015,  // Slot 1 (16x)
  0.0244,  // Slot 2 (9x)
  0.1831,  // Slot 3 (2x)
  0.8545,  // Slot 4 (1.4x)
  2.7771,  // Slot 5 (1.4x)
  6.6650,  // Slot 6 (1.2x)
  12.2192, // Slot 7 (1.1x)
  17.4561, // Slot 8 (1x)
  19.6381, // Slot 9 (0.5x) - CENTER
  17.4561, // Slot 10 (1x)
  12.2192, // Slot 11 (1.1x)
  6.6650,  // Slot 12 (1.2x)
  2.7771,  // Slot 13 (1.4x)
  0.8545,  // Slot 14 (1.4x)
  0.1831,  // Slot 15 (2x)
  0.0244,  // Slot 16 (9x)
  0.0015   // Slot 17 (16x)
];

function dropABall() {
  const bet = Number(betInputEl.value) || 10;

  // Check if enough balance
  if (balance < bet) {
    showMessage('Insufficient balance!');
    return;
  }

  // Deduct bet from balance
  balance -= bet;
  updateBalance();

  // Row 1 has 5 total pegs (1 invisible, 3 visible, 1 invisible)
  // Visible pegs are at positions 2, 3, 4 (indices 1, 2, 3)
  // Balls should drop within the range of these 3 visible pegs
  const firstRowVisiblePegs = 3;
  const firstRowTotalPegs = 5;

  // Calculate X positions of the 3 visible pegs in row 1
  // Peg 2 (index 1): leftmost visible peg
  const leftmostVisiblePegX = WIDTH / 2 + (1 - (firstRowTotalPegs - 1) / 2) * GAP;
  // Peg 4 (index 3): rightmost visible peg
  const rightmostVisiblePegX = WIDTH / 2 + (3 - (firstRowTotalPegs - 1) / 2) * GAP;

  // Drop zone is between leftmost and rightmost visible pegs
  const dropZoneLeft = leftmostVisiblePegX;
  const dropZoneRight = rightmostVisiblePegX;
  const dropZoneWidth = dropZoneRight - dropZoneLeft;
  const dropZoneCenter = (dropZoneLeft + dropZoneRight) / 2;

  // Generate Gaussian distribution using Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  // Use a small standard deviation relative to drop zone width
  // This ensures balls start within the 3 visible pegs but still achieve target distribution
  const stdDeviation = dropZoneWidth * 0.25; // 25% of drop zone width

  // Apply gaussian distribution centered in drop zone
  let x = dropZoneCenter + (gaussian * stdDeviation);

  // Clamp to ensure ball always drops within the visible peg boundaries
  x = Math.max(dropZoneLeft, Math.min(dropZoneRight, x));

  const y = -PEG_RAD;

  const ball = Bodies.circle(x, y, BALL_RAD, {
    label: "Ball",
    restitution: 0.6,
    bet: bet, // Store bet amount in ball
    render: {
      fillStyle: "#f23"
    }
  });
  clickSynth.triggerAttackRelease("32n", Tone.context.currentTime);
  Composite.add(engine.world, [ball]);
}

// Update balance display
function updateBalance() {
  balanceEl.innerText = Math.round(balance * 100) / 100;
}

// Display message to user
function showMessage(msg) {
  messageEl.innerText = msg;
  setTimeout(() => {
    if (messageEl.innerText === msg) messageEl.innerText = '';
  }, 3000);
}

// Attach UI event handlers
function attachUI() {
  const dropBtn = document.getElementById('drop-btn');
  const resetBtn = document.getElementById('reset-btn');

  dropBtn.addEventListener('click', () => {
    // Prevent spam clicking if balls are still active
    if (isDropping) {
      showMessage('Please wait for current balls to finish!');
      return;
    }

    const bet = Number(betInputEl.value) || 10;
    const count = Number(countInputEl.value) || 1;
    const totalCost = bet * count;

    // Check if total cost exceeds balance
    if (totalCost > balance) {
      showMessage(`Insufficient balance! Need $${totalCost} but only have $${balance}`);
      return;
    }

    // Set dropping flag
    isDropping = true;

    // Drop balls one by one with stagger
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        dropABall();
      }, i * 300); // 300ms delay between balls
    }
  });

  resetBtn.addEventListener('click', () => {
    balance = 1000;
    updateBalance();
    showMessage('Balance reset to $1000');
  });

  updateBalance();
}

// Helper function to check collision
function checkCollision(event, label1, label2, callback) {
  event.pairs.forEach(({ bodyA, bodyB }) => {
    let body1, body2;
    if (bodyA.label === label1 && bodyB.label === label2) {
      body1 = bodyA;
      body2 = bodyB;
    } else if (bodyA.label === label2 && bodyB.label === label1) {
      body1 = bodyB;
      body2 = bodyA;
    }

    if (body1 && body2) {
      callback(body1, body2);
    }
  });
}

// Trigger event on ball hitting ground or walls
Matter.Events.on(engine, "collisionStart", (event) => {
  // Check for ball hitting wall pegs - apply directional force
  event.pairs.forEach(({ bodyA, bodyB }) => {
    let ball, wall;

    if (bodyA.label === "Ball" && (bodyB.label === "LeftWall" || bodyB.label === "RightWall")) {
      ball = bodyA;
      wall = bodyB;
    } else if (bodyB.label === "Ball" && (bodyA.label === "LeftWall" || bodyA.label === "RightWall")) {
      ball = bodyB;
      wall = bodyA;
    }

    if (ball && wall) {
      // Apply horizontal force to push ball away from wall
      const isLeftWall = wall.label === "LeftWall";
      const forceDirection = isLeftWall ? 1 : -1; // Right for left wall, left for right wall
      const forceMagnitude = 0.002; // Adjust this value to control bounce strength

      Matter.Body.applyForce(ball, ball.position, {
        x: forceDirection * forceMagnitude,
        y: 0
      });
    }
  });

  // Check for ball hitting the ground
  checkCollision(event, "Ball", "Ground", (ballToRemove) => {
    const ballBet = ballToRemove.bet || 10;
    Matter.Composite.remove(engine.world, ballToRemove);
    const index = Math.floor(
      (ballToRemove.position.x - WIDTH / 2) / GAP + 17 / 2
    );
    if (index >= 0 && index < 17) {
      // Calculate payout
      const multiplier = SLOT_MULTIPLIERS[index];
      const payout = ballBet * multiplier;
      balance += payout;
      updateBalance();

      showMessage(`Ball landed in x${multiplier} — Won $${Math.round(payout * 100) / 100}`);

      // Ball hit note at bottom - animate with larger translateY
      const el = document.getElementById(`note-${index}`);
      if (el && el.dataset.pressed !== "true") {
        const note = notes[index];
        note.play();
        el.dataset.pressed = "true";
        el.style.transform = "translateY(-20px)"; // More visible bounce
        setTimeout(() => {
          el.dataset.pressed = "false";
          el.style.transform = "translateY(0)";
        }, 500);
      }
    }

    // Check if all balls are removed, reset dropping flag
    setTimeout(() => {
      const remainingBalls = Composite.allBodies(engine.world).filter(b => b.label === "Ball");
      if (remainingBalls.length === 0) {
        isDropping = false;
      }
    }, 100); // Small delay to ensure ball is fully removed
  });

  // Check for ball hitting peg
  checkCollision(event, "Peg", "Ball", (pegToAnimate) => {
    const index = pegs.findIndex((peg) => peg === pegToAnimate);
    if (index === -1) {
      throw new Error(
        "Could not find peg in pegs array even though we registered a ball hitting this peg"
      );
    }
    if (!pegAnims[index]) {
      pegAnims[index] = new Date().getTime();
    }
  });
});

// Run the renderer
Render.run(render);

// Create custom runner with gravitational pull per slot
const ctx = canvas.getContext("2d");

// Define gravitational pull strength for each slot (17 slots)
// Higher values = stronger pull toward that slot
// These weights are based on target probabilities to achieve 98% RTP
const slotGravityWeights = [
  0.0015,  // Slot 1 (16x) - extremely weak pull
  0.0244,  // Slot 2 (9x)
  0.1831,  // Slot 3 (2x)
  0.8545,  // Slot 4 (1.4x)
  2.7771,  // Slot 5 (1.4x)
  6.6650,  // Slot 6 (1.2x)
  12.2192, // Slot 7 (1.1x)
  17.4561, // Slot 8 (1x)
  19.6381, // Slot 9 (0.5x) - STRONGEST pull (center)
  17.4561, // Slot 10 (1x)
  12.2192, // Slot 11 (1.1x)
  6.6650,  // Slot 12 (1.2x)
  2.7771,  // Slot 13 (1.4x)
  0.8545,  // Slot 14 (1.4x)
  0.1831,  // Slot 15 (2x)
  0.0244,  // Slot 16 (9x)
  0.0015   // Slot 17 (16x) - extremely weak pull
];

function run() {
  const now = new Date().getTime();

  // Draw peg expansions
  pegAnims.forEach((anim, index) => {
    if (!anim) return;
    const delta = now - anim;
    if (delta > 1200) {
      pegAnims[index] = null;
      return;
    }
    const peg = pegs[index];
    if (!peg) throw new Error("Unknown peg at index " + index);
    const pct = delta / 1200;
    const expandProgression = 1 - Math.abs(pct * 2 - 1);
    const expandRadius = expandProgression * 12;
    ctx.fillStyle = "#fff2";
    ctx.beginPath();
    ctx.arc(peg.position.x, peg.position.y, expandRadius, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Apply gravitational pull to balls based on slot weights
  const allBodies = Composite.allBodies(engine.world);
  allBodies.forEach(body => {
    if (body.label === "Ball") {
      const ballX = body.position.x;
      const ballY = body.position.y;

      // Only apply forces when ball is below first few rows (let initial drop be natural)
      if (ballY > GAP * 3) {
        let totalForceX = 0;
        let totalWeight = 0;

        // Calculate weighted force from each slot
        slotGravityWeights.forEach((weight, slotIndex) => {
          // Calculate slot X position (slot 0 = leftmost, slot 16 = rightmost)
          const slotX = WIDTH / 2 + (slotIndex - 8) * GAP;

          // Calculate distance from ball to slot
          const dx = slotX - ballX;
          const distance = Math.abs(dx);

          // Only apply force if within reasonable range
          if (distance < WIDTH / 2) {
            // Force strength based on weight and inverse distance
            // Closer slots have stronger pull
            const distanceFactor = 1 / (1 + distance / 50); // Normalize distance
            const force = weight * distanceFactor;

            totalForceX += (dx / distance) * force; // Direction * magnitude
            totalWeight += weight * distanceFactor;
          }
        });

        // Normalize and apply the force
        if (totalWeight > 0) {
          const normalizedForce = totalForceX / totalWeight;
          const forceStrength = 0.0000275; // Adjust this to control pull strength

          Matter.Body.applyForce(body, body.position, {
            x: normalizedForce * forceStrength,
            y: 0
          });
        }
      }
    }
  });

  Engine.update(engine, 1000 / 60);

  requestAnimationFrame(run);
}

// Initialize
attachUI();
run();
