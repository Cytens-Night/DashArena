// game.js
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let username;
let players = {};
let fallingWalls = [];
let fallingPowerUps = [];
let adTimeout;
let gameStartTime;

// Show ad with a "Skip Ad" button, then start game.
function showAdAndStart() {
  const nameInput = document.getElementById("username");
  const user = nameInput ? nameInput.value : "";
  if (!user) {
    alert("Please enter a name!");
    return;
  }
  username = user;
  const startContainer = document.getElementById("startContainer");
  startContainer.innerHTML = `
    <h2>Advertisement</h2>
    <p>Your ad here...</p>
    <button id="skipAdBtn">Skip Ad</button>
  `;
  document.getElementById("skipAdBtn").addEventListener("click", skipAd);
  adTimeout = setTimeout(startGame, 5000);
}

function skipAd() {
  clearTimeout(adTimeout);
  startGame();
}

function startGame() {
  document.getElementById("startContainer").style.display = "none";
  canvas.style.display = "block";
  gameStartTime = Date.now();
  socket.emit("newPlayer", username);
  animate();
}

// Socket event listeners
socket.on("updatePlayers", (serverPlayers) => {
  players = serverPlayers;
});

socket.on("updateWalls", (serverWalls) => {
  fallingWalls = serverWalls;
});

socket.on("updatePowerUps", (serverPowerUps) => {
  fallingPowerUps = serverPowerUps;
});

socket.on("knockedOut", (survivalTime) => {
  alert("Game Over! You survived for " + Math.floor(survivalTime / 1000) + " seconds.");
  // Update best score in localStorage.
  let best = localStorage.getItem("bestScore") || 0;
  if (survivalTime > best) {
    localStorage.setItem("bestScore", survivalTime);
  }
  window.location.reload();
});

// Handle keyboard input for movement and dash.
let keys = { up: false, down: false, left: false, right: false, dash: false };
window.addEventListener("keydown", (e) => {
  switch (e.key.toLowerCase()) {
    case "arrowup":
    case "w":
      keys.up = true;
      break;
    case "arrowdown":
    case "s":
      keys.down = true;
      break;
    case "arrowleft":
    case "a":
      keys.left = true;
      break;
    case "arrowright":
    case "d":
      keys.right = true;
      break;
    case " ":
      keys.dash = true;
      break;
  }
});
window.addEventListener("keyup", (e) => {
  switch (e.key.toLowerCase()) {
    case "arrowup":
    case "w":
      keys.up = false;
      break;
    case "arrowdown":
    case "s":
      keys.down = false;
      break;
    case "arrowleft":
    case "a":
      keys.left = false;
      break;
    case "arrowright":
    case "d":
      keys.right = false;
      break;
    case " ":
      keys.dash = false;
      break;
  }
});

// Emit movement data at 60 FPS.
setInterval(() => {
  let dx = 0, dy = 0;
  if (keys.up) dy = -1;
  if (keys.down) dy = 1;
  if (keys.left) dx = -1;
  if (keys.right) dx = 1;
  socket.emit("move", { dx, dy, dash: keys.dash });
}, 1000 / 60);

// Animation loop.
function animate() {
  requestAnimationFrame(animate);
  draw();
}

// Draw everything.
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawWalls();
  drawPowerUps();
  drawPlayers();
  drawScoreboard();
}

// Draw a subtle grid.
function drawGrid() {
  const gridSize = 20;
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

// Draw falling maze walls.
// Each wall is drawn as two rectangles (left and right of the gap).
function drawWalls() {
  fallingWalls.forEach(wall => {
    ctx.fillStyle = "#FFFFFF"; // white walls
    // Left segment.
    ctx.fillRect(0, wall.y, wall.gapX, wall.thickness);
    // Right segment.
    ctx.fillRect(wall.gapX + wall.gapWidth, wall.y, canvas.width - (wall.gapX + wall.gapWidth), wall.thickness);
  });
}

// Draw power-ups.
function drawPowerUps() {
  fallingPowerUps.forEach(pu => {
    if (pu.type === "slow") {
      ctx.fillStyle = "#00BFFF"; // DeepSkyBlue for slow-motion
    } else if (pu.type === "invis") {
      ctx.fillStyle = "#9370DB"; // MediumPurple for invisibility
    }
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

// Draw players as colored circles with their username and survival time.
function drawPlayers() {
  for (let id in players) {
    let p = players[id];
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
    ctx.fillStyle = p.color;
    ctx.fill();
    // Optionally add motion blur if dashing.
    if (p.isDashing) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 20;
    }
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.shadowBlur = 0;
    const survivalTime = Math.floor((Date.now() - p.startTime) / 1000);
    ctx.font = "12px Orbitron";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(`${p.username} (${survivalTime}s)`, p.x, p.y - p.radius - 10);
  }
}

// Draw a leaderboard (current survival times) and update best score.
function drawScoreboard() {
  const playerArray = Object.values(players);
  playerArray.sort((a, b) => (Date.now() - b.startTime) - (Date.now() - a.startTime));
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(canvas.width - 150, 10, 140, playerArray.length * 25 + 20);
  ctx.font = "14px Orbitron";
  ctx.fillStyle = "#00ff99";
  ctx.textAlign = "left";
  ctx.fillText("Leaderboard", canvas.width - 140, 30);
  playerArray.forEach((p, i) => {
    const timeSurvived = Math.floor((Date.now() - p.startTime) / 1000);
    ctx.fillStyle = "#fff";
    ctx.fillText(`${p.username}: ${timeSurvived}s`, canvas.width - 140, 50 + i * 25);
  });
  // Update best score on start screen.
  let best = localStorage.getItem("bestScore") || 0;
  document.getElementById("bestScore").textContent = Math.floor(best / 1000) + "s";
}
