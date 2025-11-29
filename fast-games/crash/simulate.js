// ------------------------
// Crash Game Simulator
// ------------------------

// Your crash point generator (exact same logic from your game)
function generateCrashPoint() {
  const houseEdge = 0.04; // 96% RTP
  const r = Math.random();

  // Fair multiplier = 1 / (1 - r)
  const fair = 1 / (1 - r);

  // Apply house edge
  const crash = fair * (1 - houseEdge);

  const rounded = Math.floor(crash * 100) / 100;
  return Math.min(rounded, 1000);
}

// Simulate 1000 rounds
function simulateCrashGame({
  runs = 1000,
  bet = 1,
  autoCashout = 2.00, // CHANGE THIS to test different strategies
}) {
  let balance = 0;
  let multipliers = [];
  let wins = 0;
  let losses = 0;

  for (let i = 0; i < runs; i++) {
    const crashPoint = generateCrashPoint();
    multipliers.push(crashPoint);

    if (autoCashout <= crashPoint) {
      // win
      balance += bet * autoCashout - bet; // net profit
      wins++;
    } else {
      // lose
      balance -= bet;
      losses++;
    }
  }

  // Stats
  const avgCrash =
    multipliers.reduce((sum, x) => sum + x, 0) / multipliers.length;

  const countOver20 = multipliers.filter((x) => x >= 20).length;
  const countUnder2 = multipliers.filter((x) => x < 2).length;

  return {
    runs,
    autoCashout,
    finalProfit: balance,
    ROI: ((balance / (runs * bet)) * 100).toFixed(2) + "%",
    wins,
    losses,
    avgCrash,
    highMultipliers: countOver20,
    lowMultipliers: countUnder2,
    multipliers,
  };
}

// --------------------------
// RUN THE SIMULATION
// --------------------------

const result = simulateCrashGame({
  runs: 1000,
  bet: 1,
  autoCashout: 1.90, // try 1.1, 1.5, 2, 5, etc.
});

console.log("------ CRASH SIM RESULTS ------");
console.log(result);