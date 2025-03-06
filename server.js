// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

// -- Game Constants --
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PLAYER_RADIUS = 15;
const PLAYER_SPEED = 3;
const DASH_SPEED = 8;
const DASH_DURATION = 300;

// Wall Constants
const MIN_WALL_THICKNESS = 15;
const MAX_WALL_THICKNESS = 30;
const MIN_GAP_WIDTH = 180;
const MAX_GAP_WIDTH = 300;
let globalWallSpeed = 2;

// Power-ups
const POWER_UP_RADIUS = 10;
const POWER_UP_TYPES = ["slow", "invis", "shield"];
const POWER_UP_SPAWN_INTERVAL = 5000;

// Enemies (Squares)
const ENEMY_SIZE = 20;
const ENEMY_SPEED = 1.5;
const SPAWN_ENEMY_INTERVAL = 6000; // Adjusted for better balance

// Bullets
const BULLET_RADIUS = 5;
const BULLET_SPEED = 6;

const NEON_COLORS = ["#00ff99", "#ff00ff", "#00ffff", "#ffff00", "#ff6600"];

// -- Global Variables --
let globalWallStartTime = null;
const players = {};
let fallingWalls = [];
let fallingPowerUps = [];
let enemies = [];
let bullets = [];

// -- Helper Functions --
function randomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
}

// Spawn a falling wall
function spawnWall() {
  const thickness = Math.random() * (MAX_WALL_THICKNESS - MIN_WALL_THICKNESS) + MIN_WALL_THICKNESS;
  const gapWidth = Math.random() * (MAX_GAP_WIDTH - MIN_GAP_WIDTH) + MIN_GAP_WIDTH;
  const gapX = Math.random() * (CANVAS_WIDTH - gapWidth);
  const color = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
  return { y: -thickness, thickness, gapX, gapWidth, color };
}

// Spawn power-up
function spawnPowerUp() {
  const type = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
  const x = Math.random() * (CANVAS_WIDTH - POWER_UP_RADIUS * 2) + POWER_UP_RADIUS;
  return { type, x, y: -POWER_UP_RADIUS - 50, radius: POWER_UP_RADIUS };
}

// Spawn enemy
function spawnEnemy() {
  const x = Math.random() * (CANVAS_WIDTH - ENEMY_SIZE);
  const y = Math.random() * (CANVAS_HEIGHT - ENEMY_SIZE);
  enemies.push({ x, y, size: ENEMY_SIZE, color: "red" });
}

// -- Update Functions --
function updateWalls() {
  if (!globalWallStartTime) {
    io.emit("updateWalls", []);
    return;
  }

  const elapsed = Date.now() - globalWallStartTime;
  let currentSpeed = elapsed < 3000 ? 0 : elapsed < 5000 ? ((elapsed - 3000) / 2000) * globalWallSpeed : globalWallSpeed;

  fallingWalls.forEach(wall => { wall.y += currentSpeed; });
  fallingWalls = fallingWalls.filter(wall => wall.y <= CANVAS_HEIGHT);
  if (fallingWalls.length === 0 || fallingWalls[fallingWalls.length - 1].y > 100) {
    fallingWalls.push(spawnWall());
  }
  io.emit("updateWalls", fallingWalls);
}

function updatePowerUps() {
  for (let i = fallingPowerUps.length - 1; i >= 0; i--) {
    let pu = fallingPowerUps[i];
    pu.y += globalWallSpeed;

    // Check if player collects power-up
    for (let id in players) {
      let player = players[id];
      let dx = player.x - pu.x;
      let dy = player.y - pu.y;
      let distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < player.radius + pu.radius) {
        if (pu.type === "slow") {
          player.speed = PLAYER_SPEED / 2;
          setTimeout(() => { player.speed = PLAYER_SPEED; }, 3000);
        } else if (pu.type === "invis") {
          player.invisActive = true;
          setTimeout(() => { player.invisActive = false; }, 3000);
        } else if (pu.type === "shield") {
          player.shieldActive = true;
          setTimeout(() => { player.shieldActive = false; }, 5000);
        }
        fallingPowerUps.splice(i, 1);
        break;
      }
    }
  }
  io.emit("updatePowerUps", fallingPowerUps);
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    let enemy = enemies[i];
    let closestPlayer = Object.values(players)[0];
    if (closestPlayer) {
      let dx = closestPlayer.x - enemy.x;
      let dy = closestPlayer.y - enemy.y;
      let angle = Math.atan2(dy, dx);
      enemy.x += Math.cos(angle) * ENEMY_SPEED;
      enemy.y += Math.sin(angle) * ENEMY_SPEED;
    }

    for (let id in players) {
      let player = players[id];
      let dx = player.x - enemy.x;
      let dy = player.y - enemy.y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < player.radius + enemy.size / 2) {
        io.to(id).emit("knockedOut", Date.now() - player.startTime);
        delete players[id];
        io.emit("updatePlayers", players);
      }
    }
  }
  io.emit("updateEnemies", enemies);
}

function updateBullets() {
  bullets.forEach(bullet => {
    bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
    bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;
  });

  bullets = bullets.filter(bullet => bullet.x > 0 && bullet.x < CANVAS_WIDTH && bullet.y > 0 && bullet.y < CANVAS_HEIGHT);

  for (let i = bullets.length - 1; i >= 0; i--) {
    for (let j = enemies.length - 1; j >= 0; j--) {
      let dx = bullets[i].x - enemies[j].x;
      let dy = bullets[i].y - enemies[j].y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < BULLET_RADIUS + ENEMY_SIZE / 2) {
        bullets.splice(i, 1);
        enemies.splice(j, 1);
        break;
      }
    }
  }

  io.emit("updateBullets", bullets);
}

// Game Loop Intervals
setInterval(() => { globalWallSpeed += 0.2; }, 10000);
setInterval(updateWalls, 50);
setInterval(updatePowerUps, 50);
setInterval(updateEnemies, 50);
setInterval(updateBullets, 50);
setInterval(() => { fallingPowerUps.push(spawnPowerUp()); }, POWER_UP_SPAWN_INTERVAL);
setInterval(spawnEnemy, SPAWN_ENEMY_INTERVAL);

// -- Socket.io Handlers --
io.on("connection", (socket) => {
  socket.on("newPlayer", (username) => {
    players[socket.id] = {
      username,
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - PLAYER_RADIUS - 10,
      radius: PLAYER_RADIUS,
      color: randomColor(),
      speed: PLAYER_SPEED,
      startTime: Date.now(),
    };
    io.emit("updatePlayers", players);
  });

  socket.on("move", (data) => {
    const player = players[socket.id];
    if (!player) return;
    player.x += data.dx * player.speed;
    player.y += data.dy * player.speed;
    io.emit("updatePlayers", players);
  });

  socket.on("shoot", (data) => {
    bullets.push({ x: data.x, y: data.y, radius: BULLET_RADIUS, angle: data.angle, color: "#00BFFF" });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("updatePlayers", players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
