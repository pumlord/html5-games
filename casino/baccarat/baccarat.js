// -------------------------------------------
// SIMPLE CASINO SOUND GENERATOR (NO FILES)
// -------------------------------------------
function tone(freq, duration, type = "sine", volume = 0.3) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    osc.type = type;

    gain.gain.value = volume;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
}

// Casino-like sounds
function playDeal() {
    tone(220, 0.08, "square");   // soft slide
}

function playFlip() {
    tone(880, 0.05, "triangle"); // sharp flip
}

function playWin() {
    tone(600, 0.1);
    setTimeout(() => tone(900, 0.12), 100);  // small “ding”
}

function playLose() {
    tone(180, 0.25, "sine", 0.25); // low thud
}

// -----------------------------
// Utility: Card + Deck
// -----------------------------
const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function createDeck() {
	let deck = [];
	for (let s of suits) {
		for (let r of ranks) {
			deck.push({
				rank: r,
				suit: s
			});
		}
	}
	return shuffle(deck);
}

function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

function cardValue(card) {
	if (card.rank === "A") return 1;
	if (["10", "J", "Q", "K"].includes(card.rank)) return 0;
	return parseInt(card.rank);
}

function baccaratTotal(cards) {
	return cards.reduce((sum, c) => sum + cardValue(c), 0) % 10;
}

// -----------------------------
// Card Render (fixed for flip animation)
// -----------------------------
function renderCard(card) {
	const wrapper = document.createElement("div");
	wrapper.classList.add("card");

	const inner = document.createElement("div");
	inner.classList.add("card-inner");

	const front = document.createElement("div");
	front.classList.add("card-front");
	front.textContent = ""; // blue back

	const back = document.createElement("div");
	back.classList.add("card-back");

	const rank = document.createElement("div");
	rank.classList.add("rank");
	rank.textContent = card.rank;

	const suit = document.createElement("div");
	suit.classList.add("suit");
	suit.textContent = card.suit;
	suit.classList.add(["♥", "♦"].includes(card.suit) ? "red" : "black");

	back.appendChild(rank);
	back.appendChild(suit);

	inner.appendChild(front);
	inner.appendChild(back);
	wrapper.appendChild(inner);

	return wrapper;
}

function animateDeal(container, card, delay = 0, isThird = false, thirdClass = null) {
	const el = renderCard(card);

	if (isThird) el.classList.add("side-card"); // Horizontal 3rd card
	if (thirdClass) el.classList.add(thirdClass);

	container.appendChild(el);

	// Play deal sound
	setTimeout(() => {
		playDeal();
	}, delay);

	// Make card visible with slide-in animation
	setTimeout(() => {
		el.classList.add("slide-in");
	}, delay + 50);

	// Flip card to show face
	setTimeout(() => {
		el.classList.add("flipped");
		playFlip();
	}, delay + 200);
}

// --------------------------------------------------------
// Baccarat Third Card Rules
// --------------------------------------------------------
function determineThirdCards(playerCards, bankerCards, playerThirdCard = null) {
	const playerTotal = baccaratTotal(playerCards);
	const bankerTotal = baccaratTotal(bankerCards);

	if (playerTotal >= 8 || bankerTotal >= 8) {
		return {
			playerDraws: false,
			bankerDraws: false
		};
	}

	let playerDraws = (playerTotal <= 5);

	if (!playerDraws) {
		return {
			playerDraws,
			bankerDraws: bankerTotal <= 5
		};
	}

	const ptc = playerThirdCard ? cardValue(playerThirdCard) : null;
	let bankerDraws = false;

	switch (bankerTotal) {
		case 0:
		case 1:
		case 2:
			bankerDraws = true;
			break;
		case 3:
			bankerDraws = (ptc !== 8);
			break;
		case 4:
			bankerDraws = (ptc !== null && ptc >= 2 && ptc <= 7);
			break;
		case 5:
			bankerDraws = (ptc !== null && ptc >= 4 && ptc <= 7);
			break;
		case 6:
			bankerDraws = (ptc === 6 || ptc === 7);
			break;
		case 7:
			bankerDraws = false;
			break;
	}

	return {
		playerDraws,
		bankerDraws
	};
}

// -----------------------------
// DOM Elements
// -----------------------------
let balanceEl = document.getElementById("balance");
let messageEl = document.getElementById("message");
let betAmountEl = document.getElementById("bet-amount");
let startGameBtn = document.getElementById("start-game");

let balance = 1000;
let deck;
let roundInProgress = false;

// Guess button selection - only allow when round is NOT in progress
document.querySelectorAll(".guess-btn").forEach(btn => {
	btn.addEventListener("click", () => {
		// Prevent changing selection during active round
		if (roundInProgress) {
			return;
		}

		document.querySelectorAll(".guess-btn")
			.forEach(b => b.classList.remove("selected"));
		btn.classList.add("selected");
	});
});

// -----------------------------
// GAME START
// -----------------------------
startGameBtn.addEventListener("click", () => {
	// Prevent spam clicking - if round is already in progress, do nothing
	if (roundInProgress) {
		return;
	}

	// Validate bet amount
	let bet = parseInt(betAmountEl.value);
	if (isNaN(bet) || bet <= 0) {
		messageEl.textContent = "Please enter a valid bet amount.";
		messageEl.style.color = "#ff6b6b";
		return;
	}

	if (bet > balance) {
		messageEl.textContent = "Insufficient balance.";
		messageEl.style.color = "#ff6b6b";
		return;
	}

	// Validate guess selection
	let choice = document.querySelector(".guess-btn.selected");
	if (!choice) {
		messageEl.textContent = "Please select Player, Tie, or Banker.";
		messageEl.style.color = "#ff6b6b";
		return;
	}

	const betOn = choice.dataset.choice;

	// Start round - lock everything
	roundInProgress = true;
	startGameBtn.disabled = true;
	betAmountEl.disabled = true;

	// Disable all guess buttons during round
	document.querySelectorAll(".guess-btn").forEach(btn => {
		btn.disabled = true;
		btn.style.cursor = "not-allowed";
	});

	// Clear previous cards
	document.getElementById("player-cards").innerHTML = "";
	document.getElementById("banker-cards").innerHTML = "";

	// Deduct bet from balance
	balance -= bet;
	updateBalance();
	messageEl.textContent = "Dealing cards...";
	messageEl.style.color = "#ffd166";

	deck = createDeck();

	// Deal first 4 cards
	let playerCards = [deck.pop(), deck.pop()];
	let bankerCards = [deck.pop(), deck.pop()];

	animateDeal(document.getElementById("player-cards"), playerCards[0], 100);
	animateDeal(document.getElementById("banker-cards"), bankerCards[0], 200);
	animateDeal(document.getElementById("player-cards"), playerCards[1], 300);
	animateDeal(document.getElementById("banker-cards"), bankerCards[1], 400);

	// Apply third card rules
	let rule = determineThirdCards(playerCards, bankerCards);
	let playerThird = null;
	let totalDelay = 500; // Track total animation time

	if (rule.playerDraws) {
		playerThird = deck.pop();
		playerCards.push(playerThird);

		setTimeout(() => {
			animateDeal(
				document.getElementById("player-cards"),
				playerThird,
				0,
				true,
				"player-third"
			);
		}, 600);

		totalDelay = 800; // Update delay if 3rd card is drawn

		// Recalculate banker rule including player's 3rd card
		rule = determineThirdCards(playerCards, bankerCards, playerThird);
	}

	if (rule.bankerDraws) {
		const bankerThird = deck.pop();
		bankerCards.push(bankerThird);

		setTimeout(() => {
			animateDeal(
				document.getElementById("banker-cards"),
				bankerThird,
				0,
				true,
				"banker-third"
			);
		}, rule.playerDraws ? 800 : 600);

		totalDelay = rule.playerDraws ? 1000 : 800;
	}

	// Wait for all animations to complete, then end round
	setTimeout(() => {
		endRound(playerCards, bankerCards, betOn, bet);
	}, totalDelay + 600); // Extra buffer for flip animations
});

// ------------ HISTORY MANAGEMENT (last 8 rounds) -------------
const historyList = document.getElementById("history-list");
let history = [];

function addHistory(result) {
    if (history.length >= 8) history.shift(); // keep max 8
    history.push(result);
    renderHistory();
}

function renderHistory() {
    historyList.innerHTML = "";

    history.forEach(r => {
        const d = document.createElement("div");
        d.classList.add("history-item");

        if (r === "player") d.classList.add("history-player");
        if (r === "banker") d.classList.add("history-banker");
        if (r === "tie")    d.classList.add("history-tie");

        d.textContent = r[0].toUpperCase(); // P / B / T
        historyList.appendChild(d);
    });
}

// -----------------------------
// END ROUND
// -----------------------------
function endRound(playerCards, bankerCards, betOn, bet) {
	const p = baccaratTotal(playerCards);
	const b = baccaratTotal(bankerCards);

	let result = (p > b) ? "player" :
		(b > p) ? "banker" : "tie";

	// Add to history
	addHistory(result);

	let payout = 0;
	let profit = 0;
	let isWin = (betOn === result);

	if (isWin) {
		// WIN
		if (result === "player") payout = bet * 2;
		if (result === "banker") payout = bet * 1.95;
		if (result === "tie") payout = bet * 8;

		profit = payout - bet;
		balance += payout;

		updateBalance();
		messageEl.textContent = `🎉 You win $${profit.toFixed(2)}! Result: ${result.toUpperCase()} (Player: ${p}, Banker: ${b})`;
		messageEl.style.color = "#00ff7a";

		playWin(); // Play win sound
		flashWin(true); // highlight win
	} else {
		// LOSS
		profit = -bet;
		messageEl.textContent = `You lost $${bet.toFixed(2)}. Result: ${result.toUpperCase()} (Player: ${p}, Banker: ${b})`;
		messageEl.style.color = "#ff6b6b";

		playLose(); // Play lose sound
		flashWin(false); // highlight loss
	}

	// Re-enable controls after 2.5 seconds
	setTimeout(() => {
		roundInProgress = false;
		startGameBtn.disabled = false;
		betAmountEl.disabled = false;

		// Re-enable guess buttons
		document.querySelectorAll(".guess-btn").forEach(btn => {
			btn.disabled = false;
			btn.style.cursor = "pointer";
			btn.classList.remove("selected", "win", "lose");
		});

		// Reset message color
		messageEl.style.color = "#ffd166";
		messageEl.textContent = "";
	}, 2500);
}

function flashWin(isWin) {
	document.querySelectorAll(".guess-btn").forEach(btn => {
		btn.classList.remove("win", "lose");

		if (!btn.classList.contains("selected")) return;

		if (isWin) {
			btn.classList.add("win");
		} else {
			btn.classList.add("lose");
		}
	});
}

function updateBalance() {
	balanceEl.textContent = balance.toFixed(2);
}

document.getElementById("reset").addEventListener("click", () => {
	// Don't allow reset during active round
	if (roundInProgress) {
		messageEl.textContent = "Cannot reset during active round.";
		messageEl.style.color = "#ff6b6b";
		return;
	}

	balance = 1000;
	updateBalance();
	messageEl.textContent = "Balance reset to $1000.";
	messageEl.style.color = "#00ff7a";

	// Clear message after 2 seconds
	setTimeout(() => {
		messageEl.textContent = "";
		messageEl.style.color = "#ffd166";
	}, 2000);
});
