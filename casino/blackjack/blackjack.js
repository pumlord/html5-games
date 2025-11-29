// -----------------------------
// Blackjack Engine
// -----------------------------
const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

let deck = [];
let playerHand = [];
let dealerHand = [];
let splitHand = [];
let currentHand = 'player';
let canSplit = false;
let bet = 0;
let balance = 1000;
let playerBusted = false;

// -----------------------------
// DOM
// -----------------------------
const dealerCardsEl = document.getElementById("dealer-cards");
const playerCardsEl = document.getElementById("player-cards");
const splitArea = document.getElementById("split-area");
const splitCardsEl = document.getElementById("split-cards");

const hitBtn = document.getElementById("hit-btn");
const standBtn = document.getElementById("stand-btn");
const doubleBtn = document.getElementById("double-btn");
const splitBtn = document.getElementById("split-btn");
const dealBtn = document.getElementById("deal-btn");
const resetBtn = document.getElementById("reset");
const betAmountEl = document.getElementById("bet-amount");
const messageEl = document.getElementById("message");
const balanceEl = document.getElementById("balance");

const dealerTotalEl = document.getElementById("dealer-total");
const playerTotalEl = document.getElementById("player-total");
const splitTotalEl = document.getElementById("split-total");

// Update balance display
function updateBalance(){
    balanceEl.textContent = balance.toFixed(2);
}

// -----------------------------
// Utility
// -----------------------------
function createDeck(){
    let d = [];
    for (let s of suits){
        for (let r of ranks){
            d.push({suit:s, rank:r});
        }
    }
    return shuffle(d);
}

function shuffle(array){
    for(let i=array.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [array[i],array[j]] = [array[j],array[i]];
    }
    return array;
}

function cardValue(card){
    if(card.rank === "A") return 11;
    if(["K","Q","J"].includes(card.rank)) return 10;
    return parseInt(card.rank);
}

function handTotal(hand){
    let total = 0, aces = 0;
    for(let c of hand){
        total += cardValue(c);
        if(c.rank==="A") aces++;
    }
    while(total>21 && aces>0){
        total -= 10;
        aces--;
    }
    return total;
}

function renderCard(container, card, delay=0, hidden=false){
    const wrapper = document.createElement("div");
    wrapper.classList.add("card");
    const inner = document.createElement("div");
    inner.classList.add("card-inner");

    // card-front = Blue back (default view, no rotation)
    const front = document.createElement("div");
    front.classList.add("card-front");
    front.textContent = "";

    // card-back = White face (rotated 180deg, shows when .flipped is added)
    const back = document.createElement("div");
    back.classList.add("card-back");
    back.innerHTML = `<div class="rank">${card.rank}</div><div class="suit ${["♥","♦"].includes(card.suit)?"red":"black"}">${card.suit}</div>`;

    inner.appendChild(front);
    inner.appendChild(back);
    wrapper.appendChild(inner);
    container.appendChild(wrapper);

    // All cards should show face (rank/suit) EXCEPT dealer's hole card
    if(!hidden){
        // Face-up card - add flipped class immediately to show face
        wrapper.classList.add("flipped");
        wrapper.dataset.hidden = "false";
    } else {
        // Hole card - NO flipped class, shows blue back
        wrapper.dataset.hidden = "true";
    }

    // Animate in (slide/appear) with sound
    setTimeout(()=>{
        wrapper.classList.add("appear");
        playDeal();
        if(!hidden){
            setTimeout(()=>playFlip(), 150);
        }
    }, delay + 50);

    return wrapper;
}

// -----------------------------
// Sounds
// -----------------------------
function tone(freq,duration,type="sine",volume=0.3){
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value=freq;
    osc.type=type;
    gain.gain.value=volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+duration);
    osc.stop(ctx.currentTime+duration);
}

function playDeal(){tone(220,0.08,"square");}
function playFlip(){tone(880,0.05,"triangle");}
function playWin(){tone(600,0.1); setTimeout(()=>tone(900,0.12),100);}
function playLose(){tone(180,0.25,"sine",0.25);}

// -----------------------------
// Deal / Start Round
// -----------------------------
dealBtn.addEventListener("click", ()=>{
    bet = parseInt(betAmountEl.value);
    if(isNaN(bet)||bet<=0){
        messageEl.textContent="Enter valid bet";
        messageEl.style.color = "#ff6b6b";
        return;
    }
    if(bet>balance){
        messageEl.textContent="Insufficient balance";
        messageEl.style.color = "#ff6b6b";
        return;
    }

    balance -= bet;
    updateBalance();
    resetTable();
    deck = createDeck();
    playerHand = [deck.pop(), deck.pop()];
    dealerHand = [deck.pop(), deck.pop()];
    currentHand='player';
    canSplit = (playerHand[0].rank === playerHand[1].rank);
    playerBusted=false;

    messageEl.textContent = "Dealing...";
    messageEl.style.color = "#ffd166";

    // Render cards
    renderCard(playerCardsEl, playerHand[0], 100);
    renderCard(playerCardsEl, playerHand[1], 300);
    renderCard(dealerCardsEl, dealerHand[0], 500); // face-up
    renderCard(dealerCardsEl, dealerHand[1], 700, true); // hidden hole card

    updateTotals();
		// -----------------------------
		// Automatic Blackjack Handling
		// -----------------------------
		function isBlackjack(hand) {
			return hand.length === 2 && handTotal(hand) === 21;
		}

		if (isBlackjack(playerHand)) {
			// Disable all player controls immediately
			hitBtn.disabled = true;
			standBtn.disabled = true;
			doubleBtn.disabled = true;
			splitBtn.disabled = true;

			// Reveal dealer hole card
			const holeCardEl = dealerCardsEl.children[1];
			if (holeCardEl && holeCardEl.dataset.hidden === "true") {
				setTimeout(() => {
					holeCardEl.classList.add("flipped");
					holeCardEl.dataset.hidden = "false";
					playFlip();
					updateTotals();
				}, 500);
			}

			setTimeout(() => {
				if (isBlackjack(dealerHand)) {
					// PUSH
					balance += bet;
					messageEl.textContent = "Push – Both have Blackjack. Bet returned.";
					messageEl.style.color = "#ffd166";
				} else {
					// Player wins 3:2
					const payout = bet * 2.5;
					balance += payout;
					messageEl.textContent = `Player Blackjack! Win $${payout.toFixed(2)}`;
					messageEl.style.color = "#00ff7a";
					playWin();
				}

				updateBalance();
				resetControls(); // end round officially
			}, 900);

			return; // STOP — do not let dealer or player actions continue
		}
    enablePlayerControls();
});

// Initialize balance display
updateBalance();

// -----------------------------
// Reset Balance
// -----------------------------
resetBtn.addEventListener("click", ()=>{
    balance = 1000;
    updateBalance();
    messageEl.textContent = "Balance reset to $1000";
    messageEl.style.color = "#ffd166";
});

// -----------------------------
// Player Controls
// -----------------------------
hitBtn.addEventListener("click", ()=>{
    const hand = currentHand==='player'?playerHand:splitHand;
    const container = currentHand==='player'?playerCardsEl:splitCardsEl;
    const card = deck.pop();
    hand.push(card);
    renderCard(container, card, 0);
    updateTotals();

    const total = handTotal(hand);
    if(total>21){
        playerBusted=true;
        messageEl.textContent="Busted!";
        playLose();
        // Player busted - end round immediately without dealer drawing
        setTimeout(()=>endRound(), 800);
    }
});

standBtn.addEventListener("click", ()=>{
    if(currentHand==='player' && splitHand.length>0){
        currentHand='split';
        messageEl.textContent="Playing split hand";
    } else {
        dealerTurn();
    }
});

doubleBtn.addEventListener("click", ()=>{
    const hand = currentHand==='player'?playerHand:splitHand;
    const container = currentHand==='player'?playerCardsEl:splitCardsEl;
    if(balance>=bet){
        balance-=bet;
        bet*=2;
        const card = deck.pop();
        hand.push(card);
        renderCard(container, card, 0);
        updateTotals();
        setTimeout(()=>dealerTurn(), 500);
    } else {
        messageEl.textContent="Insufficient balance for double";
    }
});

splitBtn.addEventListener("click", ()=>{
    if(!canSplit) return;
    splitHand.push(playerHand.pop());
    splitArea.style.display='flex';
    renderCard(splitCardsEl, splitHand[0], 0);
    renderCard(playerCardsEl, playerHand[0], 0);
    splitHand.push(deck.pop());
    playerHand.push(deck.pop());
    renderCard(splitCardsEl, splitHand[1], 200);
    renderCard(playerCardsEl, playerHand[1], 200);
    canSplit=false;
    updateTotals();
});

// -----------------------------
// Dealer Turn - one by one
// -----------------------------
function dealerTurn(){
    hitBtn.disabled=true;
    standBtn.disabled=true;
    doubleBtn.disabled=true;
    splitBtn.disabled=true;

    // If player busted, just reveal hole card and end
    if(playerBusted){
        const holeCardEl = dealerCardsEl.children[1];
        if(holeCardEl && holeCardEl.dataset.hidden==="true"){
            holeCardEl.classList.add("flipped");
            holeCardEl.dataset.hidden = "false";
            playFlip();
        }
        updateTotals();
        setTimeout(endRound, 800);
        return;
    }

    // Player didn't bust - dealer plays normally
    const holeCardEl = dealerCardsEl.children[1];
    if(holeCardEl && holeCardEl.dataset.hidden==="true"){
        // Flip hole card to reveal
        holeCardEl.classList.add("flipped");
        holeCardEl.dataset.hidden = "false";
        playFlip();
    }

    function drawOne(){
        updateTotals();
        const dealerTotalVal = handTotal(dealerHand);

        if(dealerTotalVal >= 17){
            setTimeout(endRound, 600);
            return;
        }

        // Draw next card (face-up)
        const card = deck.pop();
        dealerHand.push(card);
        renderCard(dealerCardsEl, card, 0);

        setTimeout(drawOne, 600);
    }

    setTimeout(drawOne, 600);
}

// -----------------------------
// End Round / Payout
// -----------------------------
function endRound(){
    const hands = [{hand:playerHand,name:'Player'}];
    if(splitHand.length>0) hands.push({hand:splitHand,name:'Split'});

    const dealerTotalVal = handTotal(dealerHand);
    messageEl.textContent="";
    let hasWin = false;
    let hasLoss = false;

    for(let h of hands){
        const totalVal = handTotal(h.hand);
        if(totalVal>21){
            messageEl.textContent+=`${h.name} Bust! Lose $${bet}.\n`;
            hasLoss = true;
            continue;
        }

        if(totalVal===21 && h.hand.length===2 && dealerTotalVal!==21){
            const payout = bet*2.5;
            balance+=payout;
            messageEl.textContent+=`${h.name} Blackjack! Win $${payout.toFixed(2)}\n`;
            hasWin = true;
        } else if(totalVal>dealerTotalVal || dealerTotalVal>21){
            const payout = bet*2;
            balance+=payout;
            messageEl.textContent+=`${h.name} wins $${payout.toFixed(2)}\n`;
            hasWin = true;
        } else if(totalVal===dealerTotalVal){
            // Push — return bet
            balance += bet;
            messageEl.textContent+=`${h.name} Push. Bet returned $${bet}\n`;
        } else {
            messageEl.textContent+=`${h.name} loses $${bet}.\n`;
            hasLoss = true;
        }
    }

    // Color code message
    if(hasWin && !hasLoss){
        messageEl.style.color = "#00ff7a";
        playWin();
    } else if(hasLoss && !hasWin){
        messageEl.style.color = "#ff6b6b";
        playLose();
    } else {
        messageEl.style.color = "#ffd166";
    }

    updateBalance();
    resetControls();
}

// -----------------------------
// Utility: Update totals
// -----------------------------
function updateTotals(){
    playerTotalEl.textContent = handTotal(playerHand);
    if(splitHand.length>0) splitTotalEl.textContent = handTotal(splitHand);

    // Dealer shows only visible cards (not hidden)
    const visibleCards = dealerCardsEl.querySelectorAll('.card[data-hidden="false"]');
    if(visibleCards.length === dealerHand.length){
        // All cards visible - show full total
        dealerTotalEl.textContent = handTotal(dealerHand);
    } else {
        // Hole card hidden - show only first card total
        dealerTotalEl.textContent = dealerHand.length > 0 ? cardValue(dealerHand[0]) : 0;
    }
}

function resetTable(){
    dealerCardsEl.innerHTML="";
    playerCardsEl.innerHTML="";
    splitCardsEl.innerHTML="";
    splitArea.style.display='none';
    playerHand=[];
    dealerHand=[];
    splitHand=[];
    playerBusted=false;
    messageEl.textContent="";
    resetControls();
}

function enablePlayerControls(){
    hitBtn.disabled=false;
    standBtn.disabled=false;
    doubleBtn.disabled=false;
    splitBtn.disabled=!canSplit;
    dealBtn.disabled=true; // can't deal until round ends
}

function resetControls(){
    hitBtn.disabled=true;
    standBtn.disabled=true;
    doubleBtn.disabled=true;
    splitBtn.disabled=true;
    dealBtn.disabled=false; // re-enable only after round ends
}
