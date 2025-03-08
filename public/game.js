const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let players = {};
let mazeWalls = [];
let foodItems = [];
let bots = [];
let bullets = [];
let survivalTime = 0;
let paused = false;
let gameSpeedMultiplier = 1; // 🔴 Default speed multiplier


setInterval(() => {
  if (!paused) {
      survivalTime += 1; // 🔴 Increase time every second
  }
}, 1000);

const BULLET_RADIUS = 5;
const pauseBtn = document.getElementById("pauseBtn");

// **Receive Game Updates from Server**
socket.on("updateGame", (data) => {
  console.log("🔵 Received Game Update:", data); // Debugging
  players = data.players || {};
  mazeWalls = data.mazeWalls || [];
  foodItems = data.foodItems || [];
  bots = data.bots || [];
  bullets = data.bullets || [];
  coins = data.coins || [];
  gameSpeedMultiplier = data.gameSpeedMultiplier || 1;

  let player = players[socket.id];
  if (player) {
      player.coinsCollected = player.coinsCollected || 0; // ✅ Ensure coinsCollected exists
  }
});


socket.on("knockedOut", (time) => {
  alert(`💀 Game Over! You survived for ${Math.floor(time / 1000)} seconds.`);
  window.location.reload();
});
socket.on("updateCoins", (serverCoins) => {
  coins = serverCoins;
});

function drawCoins() {
  coins.forEach(coin => {
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("🪙", coin.x, coin.y);
  });
}

// **Show Debugging Info in Console**
setInterval(() => {
    console.clear();
    console.log("Players:", players);
    console.log("Walls:", mazeWalls);
    console.log("Food:", foodItems);
    console.log("Bots:", bots);
    console.log("Bullets:", bullets);

}, 2000);

// **Start Game**
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

// **Pause Button Toggle**
function togglePause() {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
}

// **Player Movement Controls**
let keys = { up: false, down: false, left: false, right: false };

window.addEventListener("keydown", (e) => {
  if (!e || !e.key) return; // Prevents undefined error
  const key = e.key.toLowerCase(); // Ensures it's a valid string

  switch (key) {
      case "arrowup": case "w": keys.up = true; break;
      case "arrowdown": case "s": keys.down = true; break;
      case "arrowleft": case "a": keys.left = true; break;
      case "arrowright": case "d": keys.right = true; break;
  }
});

window.addEventListener("keyup", (e) => {
  if (!e || !e.key) return; // Prevents undefined error
  const key = e.key.toLowerCase(); // Ensures it's a valid string

  switch (key) {
      case "arrowup": case "w": keys.up = false; break;
      case "arrowdown": case "s": keys.down = false; break;
      case "arrowleft": case "a": keys.left = false; break;
      case "arrowright": case "d": keys.right = false; break;
  }
});


// **Send Movement Data**
setInterval(() => {
    if (!paused) {
        let dx = 0, dy = 0;
        if (keys.up) dy = -1;
        if (keys.down) dy = 1;
        if (keys.left) dx = -1;
        if (keys.right) dx = 1;
        socket.emit("move", { dx, dy });
    }
}, 1000 / 60);

// **Shooting Mechanic**
canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) { 
        shootBullet(e);
    }
});

function shootBullet(event) {
    const player = players[socket.id];
    if (player) {
        let rect = canvas.getBoundingClientRect();
        let mouseX = event.clientX - rect.left;
        let mouseY = event.clientY - rect.top;

        let angle = Math.atan2(mouseY - player.y, mouseX - player.x);
        socket.emit("shoot", { x: player.x, y: player.y, angle });
    }
}

// **Rendering Functions**
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawMaze();
  drawFood();
  drawBots();
  drawBullets();
  drawCoins(); // 🔴 Draw the falling coins
  drawPlayers();
  drawScoreboard();
}

// **Draw Grid Background**
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

// **Draw Walls (Maze)**
function drawMaze() {
  mazeWalls.forEach(wall => {
      if (!wall) return;  // ✅ Prevents errors

      ctx.fillStyle = "#8B0000";
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
  });
}

// **Draw Food Items**
function drawFood() {
  foodItems.forEach(food => {
      if (!food.emoji) return; // 🔴 Safety check

      ctx.font = "20px Arial"; // 🔴 Adjust font size
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(food.emoji, food.x, food.y); // 🔴 Draw emoji at food location
  });
}

function drawScoreboard() {
  let player = players[socket.id] || { coinsCollected: 0 };

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(canvas.width - 220, 10, 210, 100);
  ctx.font = "16px Orbitron";
  ctx.fillStyle = "#00ff99";
  ctx.fillText("⏳ Time: " + survivalTime + "s", canvas.width - 200, 35);
  ctx.fillText("🚀 Speed: " + gameSpeedMultiplier.toFixed(1) + "x", canvas.width - 200, 60);
  ctx.fillText("🪙 Coins: " + player.coinsCollected, canvas.width - 200, 85);
}



// **Draw Bots (Enemies)**
function drawBots() {
  bots.forEach(bot => {
      if (!bot) return;  // ✅ Prevents errors

      ctx.fillStyle = "red";
      ctx.fillRect(bot.x - bot.size / 2, bot.y - bot.size / 2, bot.size, bot.size);
  });
}


// **Draw Bullets**
function drawBullets() {
  bullets.forEach(bullet => {
      if (!bullet) return;  // ✅ Prevents errors

      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = "#00BFFF";
      ctx.fill();
  });
}


// **Draw Players**
function drawPlayers() {
  Object.values(players).forEach(player => {
      if (!player) return;  // ✅ Prevents errors

      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius, 0, 2 * Math.PI);
      ctx.fillStyle = player.color;
      ctx.fill();

      ctx.font = "12px Orbitron";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(player.username, player.x, player.y - player.radius - 10);
  });
}


// **Start Game Animation**
function animate() {
    requestAnimationFrame(animate);
    if (!paused) draw();
}

animate();
