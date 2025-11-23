const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let balance = 1000;
let betAmount = 10;
let profitsTaken = false;
let crashed = false;
let gameLoop;
let curvePoints = [];
let rocketPosition = {x: 0, y: canvas.height};
let floatMultipliers = [];
let particles = [];
let trailPoints = [];

const balanceDisplay = document.getElementById('balance');
const betInput = document.getElementById('betAmount');
const currentMultiplierEl = document.getElementById('currentMultiplier');
const crashedAtEl = document.getElementById('crashedAt');
const lastCrashesEl = document.getElementById('lastCrashes');

balanceDisplay.innerText = balance + '$';

const HOUSE_EDGE = 0.96; // 4% edge
let targetMultiplier = getCrashMultiplier();
let frameCount = 0;

function getCrashMultiplier() {
    const min = 1.0;
    const max = 10.0;
    return (Math.random()*(max-min)+min)*HOUSE_EDGE;
}

// Easing function for smooth acceleration
function easeOutExpo(x) {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

function startGame() {
    if(balance < betInput.value || betInput.value <= 0) return alert('Invalid bet');
    betAmount = Number(betInput.value);
    balance -= betAmount;
    balanceDisplay.innerText = balance.toFixed(2) + '$';

    crashed = false;
    profitsTaken = false;
    curvePoints = [{x:0, y:canvas.height}];
    rocketPosition = {x:0, y:canvas.height};
    floatMultipliers = [];
    particles = [];
    trailPoints = [];
    targetMultiplier = getCrashMultiplier();
    frameCount = 0;

    gameLoop = setInterval(updateGame, 16);
}

function takeProfits() {
    if(crashed || profitsTaken) return;
    profitsTaken = true;
    const multiplier = getCurrentMultiplier();
    const profit = betAmount * multiplier;
    balance += profit;
    balanceDisplay.innerText = balance.toFixed(2) + '$';
}

function getCurrentMultiplier() {
    return curvePoints.length/100;
}

function updateGame() {
    updateCurvePoints();
    drawGame();
    if(getCurrentMultiplier() >= targetMultiplier) {
        crashGame();
    }
}

function updateCurvePoints() {
    frameCount++;

    // Accelerating X movement
    const t = frameCount/500; // controls speed duration
    const deltaX = 1 + easeOutExpo(Math.min(t,1))*3; // slow start, speeds up
    const last = curvePoints[curvePoints.length-1];
    const newX = last.x + deltaX;
    const newMultiplier = getCurrentMultiplier();
    const newY = canvas.height - (Math.pow(newX, 1.7)/100);

    const point = {x:newX, y:newY};
    curvePoints.push(point);
    rocketPosition = point;

    // Floating multipliers
    floatMultipliers.push({
        x: newX + 10 + Math.random()*10,
        y: newY - 20,
        alpha:1,
        text: newMultiplier.toFixed(2)+'x'
    });
    floatMultipliers = floatMultipliers.filter(f => f.alpha > 0);
    floatMultipliers.forEach(f => { f.y -= 0.5; f.alpha -= 0.02; });

    // Trail
    trailPoints.push(point);
    if(trailPoints.length > 150) trailPoints.shift();

    currentMultiplierEl.innerText = newMultiplier.toFixed(2) + 'x';
}

function drawGame() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Neon trail
    if(trailPoints.length >= 2){
        ctx.beginPath();
        for(let i=0;i<trailPoints.length;i++){
            const alpha = i/trailPoints.length;
            ctx.strokeStyle = `rgba(0,255,150,${alpha})`;
            if(i===0) ctx.moveTo(trailPoints[i].x, trailPoints[i].y);
            else ctx.lineTo(trailPoints[i].x, trailPoints[i].y);
        }
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // Main curve
    if(curvePoints.length >= 2){
        ctx.beginPath();
        ctx.moveTo(curvePoints[0].x, curvePoints[0].y);
        for(let i=1;i<curvePoints.length;i++){
            ctx.lineTo(curvePoints[i].x, curvePoints[i].y);
        }
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Rocket
    ctx.font = '30px Arial';
    ctx.fillText(crashed ? '💥' : '🚀', rocketPosition.x, rocketPosition.y-10);

    // Floating multipliers
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    floatMultipliers.forEach(f => {
        ctx.fillStyle = `rgba(255,255,255,${f.alpha})`;
        ctx.fillText(f.text, f.x, f.y);
    });

    // Crash particles
    if(crashed){
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.03;
        });
        particles = particles.filter(p => p.alpha>0);
        particles.forEach(p => {
            ctx.fillStyle = `rgba(255,255,0,${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
            ctx.fill();
        });
    }
}

function crashGame() {
    clearInterval(gameLoop);
    crashed = true;
    createParticles();
    const crashValue = getCurrentMultiplier().toFixed(2);
    crashedAtEl.innerText = 'Multiplier at crash: '+crashValue;
    const crashP = document.createElement('p');
    crashP.innerText = crashValue;
    crashP.style.color = profitsTaken ? 'lime' : 'red';
    lastCrashesEl.appendChild(crashP);
}

function createParticles() {
    for(let i=0;i<30;i++){
        particles.push({
            x: rocketPosition.x,
            y: rocketPosition.y-10,
            vx: (Math.random()-0.5)*4,
            vy: (Math.random()-1.5)*4,
            alpha:1,
            size: Math.random()*4+2
        });
    }
}

document.getElementById('submitBet').addEventListener('click', startGame);
document.getElementById('takeProfits').addEventListener('click', takeProfits);
