// game.js
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let username;
let players = {};
let fallingWalls = [];
let foodItems = [];
let bots = [];
let bullets = [];
let paused = false;

const BULLET_RADIUS = 5;
const pauseBtn = document.getElementById("pauseBtn");

function showAdAndStart() {
  const nameInput = document.getElementById("username");
  const user = nameInput ? nameInput.value : "";
  if (!user) {
    alert("Please enter a name!");
    return;
  }
  username = user;
  document.getElementById("startContainer").style.display = "none";
  canvas.style.display = "block";
  pauseBtn.style.display = "block";
  socket.emit("newPlayer", username);
  animate();
}

function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
}

// **Socket Event Listeners**
socket.on("updatePlayers", (serverPlayers) => { players = serverPlayers; });
socket.on("updateWalls", (serverWalls) => { fallingWalls = serverWalls; });
socket.on("updateFood", (serverFood) => { foodItems = serverFood; });
socket.on("updateBots", (serverBots) => { bots = serverBots; });
socket.on("updateBullets", (serverBullets) => { bullets = serverBullets; });

socket.on("knockedOut", (survivalTime) => {
  alert(`Game Over! You survived for ${Math.floor(survivalTime / 1000)} seconds.`);
  window.location.reload();
});

// **Keyboard Movement**
let keys = { up: false, down: false, left: false, right: false, dash: false };

window.addEventListener("keydown", (e) => {
  switch (e.key.toLowerCase()) {
    case "arrowup": case "w": keys.up = true; break;
    case "arrowdown": case "s": keys.down = true; break;
    case "arrowleft": case "a": keys.left = true; break;
    case "arrowright": case "d": keys.right = true; break;
    case " ": keys.dash = true; break;
  }
});

window.addEventListener("keyup", (e) => {
  switch (e.key.toLowerCase()) {
    case "arrowup": case "w": keys.up = false; break;
    case "arrowdown": case "s": keys.down = false; break;
    case "arrowleft": case "a": keys.left = false; break;
    case "arrowright": case "d": keys.right = false; break;
    case " ": keys.dash = false; break;
  }
});

// **Emit Player Movement at 60 FPS**
setInterval(() => {
  if (!paused) {
    let dx = 0, dy = 0;
    if (keys.up) dy = -1;
    if (keys.down) dy = 1;
    if (keys.left) dx = -1;
    if (keys.right) dx = 1;
    socket.emit("move", { dx, dy, dash: keys.dash });
  }
}, 1000 / 60);

// **Left-Click to Shoot Bullets**
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) { // Left-click to shoot
    shootBullet(e);
  }
});

// **Shoot Bullets Toward Mouse Direction**
function shootBullet(event) {
  const player = players[socket.id];
  if (player) {
      let rect = canvas.getBoundingClientRect();
      let x = event.clientX - rect.left;
      let y = event.clientY - rect.top;
      let angle = Math.atan2(y - player.y, x - player.x);
      socket.emit("shoot", { x: player.x, y: player.y, angle });
  }
}


// **Game Loop**
function animate() {
  requestAnimationFrame(animate);
  if (!paused) draw();
}

// **Draw Everything**
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawWalls();
  drawFood();
  drawBots();
  drawBullets();
  drawPlayers();
}

// **Draw Walls**
function drawWalls() {
  fallingWalls.forEach(wall => {
    ctx.fillStyle = wall.color;
    ctx.fillRect(0, wall.y, wall.gapX, wall.thickness);
    ctx.fillRect(wall.gapX + wall.gapWidth, wall.y, canvas.width - (wall.gapX + wall.gapWidth), wall.thickness);
  });
}

// **Draw Food Items**
function drawFood() {
  foodItems.forEach(food => {
    ctx.fillStyle = "green";
    ctx.fillRect(food.x - food.size / 2, food.y - food.size / 2, food.size, food.size);
  });
}

// **Draw Bots (Chasing Enemies)**
function drawBots() {
  bots.forEach(bot => {
    ctx.fillStyle = "orange";
    ctx.fillRect(bot.x - bot.size / 2, bot.y - bot.size / 2, bot.size, bot.size);
  });
}

// **Draw Bullets**
function drawBullets() {
  bullets.forEach(bullet => {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = "#00BFFF";
    ctx.fill();
  });
}

// **Draw Players**
function drawPlayers() {
  for (let id in players) {
    let p = players[id];
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
    ctx.fillStyle = p.color;
    ctx.fill();

    let info = `${p.username}`;
    ctx.font = "12px Orbitron";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(info, p.x, p.y - p.radius - 10);
  }
}

// **Draw Grid**
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
