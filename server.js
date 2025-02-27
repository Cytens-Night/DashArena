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
const DASH_DURATION = 300; // milliseconds

const WALL_THICKNESS = 20;
const MIN_GAP_WIDTH = 100;
const MAX_GAP_WIDTH = 200;
const INITIAL_WALL_SPEED = 2;
let globalWallSpeed = INITIAL_WALL_SPEED;

const POWER_UP_RADIUS = 10;
const POWER_UP_TYPES = ["slow", "invis"];
const POWER_UP_SPAWN_INTERVAL = 5000; // spawn every 5 seconds

// -- Data Structures --
const players = {};         // key: socket id, value: player object
let fallingWalls = [];      // array of wall objects
let fallingPowerUps = [];   // array of power-up objects

// -- Helper Functions --

// Generate a random color (avoid pure black)
function randomColor() {
  let color;
  do {
    color = '#' + Math.floor(Math.random() * 16777215).toString(16);
  } while (color.length < 7 || color === '#000000');
  return color;
}

// Spawn a new falling maze wall.
// Each wall is a horizontal barrier with a gap.
// It is represented as an object with y (vertical position),
// thickness, gapX (starting x of gap) and gapWidth.
function spawnWall() {
  const gapWidth = Math.random() * (MAX_GAP_WIDTH - MIN_GAP_WIDTH) + MIN_GAP_WIDTH;
  const gapX = Math.random() * (CANVAS_WIDTH - gapWidth);
  return {
    y: -WALL_THICKNESS,
    thickness: WALL_THICKNESS,
    gapX,
    gapWidth
  };
}

// Spawn a new power-up.
function spawnPowerUp() {
  const type = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
  const x = Math.random() * (CANVAS_WIDTH - POWER_UP_RADIUS * 2) + POWER_UP_RADIUS;
  return {
    type,
    x,
    y: -POWER_UP_RADIUS,
    radius: POWER_UP_RADIUS
  };
}

// -- Update Functions --

// Update falling walls: move them downward, remove off-screen ones,
// and spawn a new wall if needed.
function updateWalls() {
  fallingWalls.forEach(wall => {
    wall.y += globalWallSpeed;
  });
  fallingWalls = fallingWalls.filter(wall => wall.y <= CANVAS_HEIGHT);
  // If there are no walls or the last wall is sufficiently down, spawn one.
  if (fallingWalls.length === 0 || fallingWalls[fallingWalls.length - 1].y > 100) {
    fallingWalls.push(spawnWall());
  }
  io.emit("updateWalls", fallingWalls);
}

// Update falling power-ups: move them downward and remove off-screen ones.
function updatePowerUps() {
  fallingPowerUps.forEach(pu => {
    pu.y += globalWallSpeed;
  });
  fallingPowerUps = fallingPowerUps.filter(pu => pu.y - pu.radius <= CANVAS_HEIGHT);
  io.emit("updatePowerUps", fallingPowerUps);
}

// Gradually increase the falling speed (difficulty) over time.
setInterval(() => {
  globalWallSpeed += 0.1;
}, 10000); // every 10 seconds

// Update walls and power-ups at regular intervals.
setInterval(updateWalls, 50);
setInterval(updatePowerUps, 50);

// Spawn power-ups periodically.
setInterval(() => {
  fallingPowerUps.push(spawnPowerUp());
}, POWER_UP_SPAWN_INTERVAL);

// -- Socket.io Handlers --
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // New player joins
  socket.on("newPlayer", (username) => {
    players[socket.id] = {
      username: username,
      x: Math.random() * (CANVAS_WIDTH - PLAYER_RADIUS * 2) + PLAYER_RADIUS,
      y: Math.random() * (CANVAS_HEIGHT - PLAYER_RADIUS * 2) + PLAYER_RADIUS,
      radius: PLAYER_RADIUS,
      color: randomColor(),
      speed: PLAYER_SPEED,
      isDashing: false,
      dashCooldown: false,
      startTime: Date.now(), // used to calculate survival time
      slowActive: false,
      invisActive: false
    };
    io.emit("updatePlayers", players);
    // Also send current walls and power-ups so new player can render them.
    socket.emit("updateWalls", fallingWalls);
    socket.emit("updatePowerUps", fallingPowerUps);
  });

  // Handle movement input from the player.
  // Data includes dx, dy, and whether the dash button is pressed.
  socket.on("move", (data) => {
    const player = players[socket.id];
    if (!player) return;

    // Handle dash initiation.
    if (data.dash && !player.isDashing && !player.dashCooldown) {
      player.isDashing = true;
      player.dashCooldown = true;
      setTimeout(() => { player.isDashing = false; }, DASH_DURATION);
      setTimeout(() => { player.dashCooldown = false; }, DASH_DURATION + 500);
    }

    const moveSpeed = player.isDashing ? DASH_SPEED : player.speed;
    player.x += data.dx * moveSpeed;
    player.y += data.dy * moveSpeed;

    // Constrain player within the arena.
    if (player.x < player.radius) player.x = player.radius;
    if (player.x > CANVAS_WIDTH - player.radius) player.x = CANVAS_WIDTH - player.radius;
    if (player.y < player.radius) player.y = player.radius;
    if (player.y > CANVAS_HEIGHT - player.radius) player.y = CANVAS_HEIGHT - player.radius;

    // -- Collision Detection --

    // 1. Check collision with falling walls (if not invincible).
    if (!player.invisActive) {
      for (let wall of fallingWalls) {
        // If player's vertical span overlaps the wall.
        if (player.y + player.radius >= wall.y && player.y - player.radius <= wall.y + wall.thickness) {
          // If player's horizontal position is not within the gap (with a small tolerance).
          if (player.x - player.radius < wall.gapX || player.x + player.radius > wall.gapX + wall.gapWidth) {
            const survivalTime = Date.now() - player.startTime;
            socket.emit("knockedOut", survivalTime);
            delete players[socket.id];
            io.emit("updatePlayers", players);
            return;
          }
        }
      }
    }

    // 2. Check collision with falling power-ups.
    for (let i = 0; i < fallingPowerUps.length; i++) {
      const pu = fallingPowerUps[i];
      const dx = player.x - pu.x;
      const dy = player.y - pu.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < player.radius + pu.radius) {
        // Apply power-up effects.
        if (pu.type === "slow") {
          player.slowActive = true;
          // For 3 seconds, slow down the player's speed.
          player.speed = PLAYER_SPEED / 2;
          setTimeout(() => {
            player.slowActive = false;
            player.speed = PLAYER_SPEED;
          }, 3000);
        } else if (pu.type === "invis") {
          player.invisActive = true;
          setTimeout(() => {
            player.invisActive = false;
          }, 3000);
        }
        // Remove the collected power-up.
        fallingPowerUps.splice(i, 1);
        i--;
      }
    }

    io.emit("updatePlayers", players);
  });

  // When a player disconnects.
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    delete players[socket.id];
    io.emit("updatePlayers", players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
