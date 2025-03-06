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
const BULLET_RADIUS = 5;
const BULLET_SPEED = 6;

// Delayed game start
let gameStartTime = null;
const WALL_SPAWN_DELAY = 3000;

// Bots & Food
const BOT_SIZE = 20;
const BOT_SPEED = 1.5;
const BOT_SPAWN_INTERVAL = 10000;
const FOOD_SIZE = 10;
const FOOD_SPAWN_INTERVAL = 7000;

const players = {};
let bots = [];
let foodItems = [];
let bullets = [];
let fallingWalls = [];

// -- Helper Functions --
function randomPositionWithinCanvas(size) {
    return Math.random() * (CANVAS_WIDTH - size) + size / 2;
}

function spawnWall() {
  if (!gameStartTime || Date.now() - gameStartTime < WALL_SPAWN_DELAY) return;

  const gapX = Math.random() * (CANVAS_WIDTH - 250); // Controls horizontal gap position
  const gapWidth = Math.random() * (250 - 180) + 580; // Controls gap size (increase for easier game)
  const thickness = Math.random() * (30 - 15) + 15; // Wall thickness

  fallingWalls.push({ y: -thickness, gapX, gapWidth, thickness, color: "#ff00ff" });
}

// **Increase or Decrease the Wall Spacing Interval**
setInterval(spawnWall, 65000); // Change the timing here (increase for more spacing, decrease for less)


function spawnBot() {
    if (!gameStartTime || Date.now() - gameStartTime < WALL_SPAWN_DELAY) return;

    bots.push({
        x: randomPositionWithinCanvas(BOT_SIZE),
        y: -BOT_SIZE / 2,
        size: BOT_SIZE,
        speed: BOT_SPEED,
    });
}

function spawnFood() {
    if (!gameStartTime || Date.now() - gameStartTime < WALL_SPAWN_DELAY) return;

    foodItems.push({
        x: randomPositionWithinCanvas(FOOD_SIZE),
        y: randomPositionWithinCanvas(FOOD_SIZE),
        size: FOOD_SIZE,
    });
}

// -- Update Functions --
function updateWalls() {
    fallingWalls.forEach(wall => { wall.y += 2; });
    fallingWalls = fallingWalls.filter(wall => wall.y <= CANVAS_HEIGHT);
    io.emit("updateWalls", fallingWalls);
}

function updateBots() {
    bots.forEach(bot => {
        bot.y += bot.speed;
        let closestPlayer = Object.values(players)[0];

        if (closestPlayer) {
            let dx = closestPlayer.x - bot.x;
            let dy = closestPlayer.y - bot.y;
            let angle = Math.atan2(dy, dx);
            bot.x += Math.cos(angle) * bot.speed;
        }
    });

    bots = bots.filter(bot => bot.y - bot.size / 2 <= CANVAS_HEIGHT);
    io.emit("updateBots", bots);
}

function updateFood() {
    io.emit("updateFood", foodItems);
}

// **Collision Detection (Game Over)**
function checkCollisions() {
    for (let id in players) {
        let player = players[id];

        // Check collision with walls
        for (let wall of fallingWalls) {
            if (
                player.y + player.radius >= wall.y &&
                player.y - player.radius <= wall.y + wall.thickness &&
                (player.x - player.radius < wall.gapX || player.x + player.radius > wall.gapX + wall.gapWidth)
            ) {
                io.to(id).emit("knockedOut", Date.now() - gameStartTime);
                delete players[id];
                io.emit("updatePlayers", players);
                return;
            }
        }

        // Check collision with bots
        for (let bot of bots) {
            let dx = player.x - bot.x;
            let dy = player.y - bot.y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < player.radius + bot.size / 2) {
                io.to(id).emit("knockedOut", Date.now() - gameStartTime);
                delete players[id];
                io.emit("updatePlayers", players);
                return;
            }
        }
    }
}

// Game Loop Intervals
setInterval(updateWalls, 50);
setInterval(updateBots, 50);
setInterval(updateFood, 50);
setInterval(spawnWall, 2000);
setInterval(spawnBot, BOT_SPAWN_INTERVAL);
setInterval(spawnFood, FOOD_SPAWN_INTERVAL);
setInterval(checkCollisions, 100);

// -- Socket.io Handlers --
io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("newPlayer", (username) => {
        if (!gameStartTime) gameStartTime = Date.now();

        players[socket.id] = {
            username,
            x: CANVAS_WIDTH / 2,
            y: CANVAS_HEIGHT - PLAYER_RADIUS - 10,
            radius: PLAYER_RADIUS,
            color: "#00ff99",
            speed: PLAYER_SPEED,
        };

        io.emit("updatePlayers", players);
    });

    socket.on("move", (data) => {
        const player = players[socket.id];
        if (!player) return;

        player.x += data.dx * PLAYER_SPEED;
        player.y += data.dy * PLAYER_SPEED;

        // Prevent player from leaving canvas
        player.x = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, player.x));
        player.y = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, player.y));

        io.emit("updatePlayers", players);
    });

    // **🔫 Shooting Mechanic (Place It Here!)**
    socket.on("shoot", (data) => {
      bullets.push({
          x: data.x,
          y: data.y,
          angle: data.angle,
      });

      io.emit("updateBullets", bullets);
  });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        delete players[socket.id];
        io.emit("updatePlayers", players);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
