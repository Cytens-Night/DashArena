const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PLAYER_RADIUS = 15;
const PLAYER_SPEED = 3;
const BULLET_RADIUS = 5;
const BULLET_SPEED = 6;
const WALL_THICKNESS = 20;
const BOT_SPEED = 1.2;

const players = {};
let bullets = [];
let mazeWalls = [];
let foodItems = [];
let bots = [];
let coins = []; 
let gameSpeedMultiplier = 1;

// ✅ (NEW) Wave system variables
let currentWave = 1;
let waveTime = 0;

// Generate random positions
function randomPositionWithinCanvas(size) {
    return Math.random() * (CANVAS_WIDTH - size) + size / 2;
}

// Generate maze walls at random positions
function generateMazeWalls() {
  mazeWalls = [];

  // List of wall images for variety
  const imagesArray = ["planet1", "planet2", "wall1", "wall2", "wall3"];

  for (let i = 0; i < 10; i++) {
      let safeZone = 150; // Distance from players
      let randPick = imagesArray[Math.floor(Math.random() * imagesArray.length)];

      let wallX, wallY;
      do {
          wallX = randomPositionWithinCanvas(100);
          wallY = randomPositionWithinCanvas(100);
      } while (
          !isSafeFromPlayers(wallX, wallY, safeZone) 
          // Already had a check for keep walls 150px away from center? 
          // We can keep your existing logic too:
          || (Math.abs(wallX - CANVAS_WIDTH / 2) < safeZone &&
              Math.abs(wallY - CANVAS_HEIGHT - 50) < safeZone)
      );

      mazeWalls.push({
          x: wallX,
          y: wallY,
          width: Math.random() * 100 + 30,
          height: Math.random() * 50 + 20,
          color: "#8B0000",
          imageName: randPick,
      });
  }
}


// Spawn food
function spawnFood() {
  if (foodItems.length >= 3) return; 
  const fruitEmojis = ["🍏", "🍎", "🍌", "🍉", "🍒", "🍇", "🍓", "🥭", "🍍", "🥝"];
  let randomFruit = fruitEmojis[Math.floor(Math.random() * fruitEmojis.length)];
  foodItems.push({
      x: randomPositionWithinCanvas(15),
      y: randomPositionWithinCanvas(15),
      size: 15,
      emoji: randomFruit,
  });
  console.log(`🍏 New Food Spawned: ${randomFruit}`);
}

function checkCollisions() {
  Object.keys(players).forEach(playerID => {
      let player = players[playerID];

      // Check if player eats food
      foodItems = foodItems.filter(food => {
          let dx = player.x - food.x;
          let dy = player.y - food.y;
          if (Math.sqrt(dx*dx + dy*dy) < player.radius + food.size) {
              console.log(`✅ Player ${player.username} ate ${food.emoji}!`);
              let speedBoostTime = Math.floor(Math.random() * 10) + 1;
              let originalSpeed = player.speed;
              player.speed *= 1.5;
              setTimeout(() => {
                  player.speed = originalSpeed;
              }, speedBoostTime * 1000);
              return false; 
          }
          return true;
      });

      // Check if player hits a wall -> game over
      mazeWalls.forEach(wall => {
          if (
              player.x + player.radius > wall.x &&
              player.x - player.radius < wall.x + wall.width &&
              player.y + player.radius > wall.y &&
              player.y - player.radius < wall.y + wall.height
          ) {
              console.log(`🚨 Player ${player.username} hit a wall!`);
              io.to(playerID).emit("knockedOut", Date.now());
              delete players[playerID];
              io.emit("updatePlayers", players);
          }
      });

      // Check if player collects a coin => replaced with egg in client, but logic is same.
      coins = coins.filter(coin => {
        let collected = false;
        Object.keys(players).forEach(pid => {
            let p = players[pid];
            let dx = p.x - coin.x;
            let dy = p.y - coin.y;
            if (Math.sqrt(dx*dx + dy*dy) < p.radius + coin.size) {
                console.log(`🪙 Player ${p.username} collected a coin!`);
                if (!p.coinsCollected) p.coinsCollected = 0;
                p.coinsCollected += 1;
                collected = true;
            }
        });
        return !collected;
      });
  });
}

// Spawn bots (enemies)
function spawnBot() {
  let safeZone = 150; // distance from players
  let botX, botY;
  do {
    botX = randomPositionWithinCanvas(20);
    botY = randomPositionWithinCanvas(20);
  } while (!isSafeFromPlayers(botX, botY, safeZone));

  bots.push({
      x: botX,
      y: botY,
      size: 20,
      speed: BOT_SPEED,
      alive: true,
  });
}


// Update bullets using dx/dy; handle collisions with bots, etc.
function updateBullets() {
  bullets.forEach((bullet, i) => {
      bullet.x += bullet.dx * BULLET_SPEED;
      bullet.y += bullet.dy * BULLET_SPEED;

      if (bullet.x < 0 || bullet.x > CANVAS_WIDTH ||
          bullet.y < 0 || bullet.y > CANVAS_HEIGHT) {
          bullets.splice(i, 1);
          return;
      }

      // Bullet hits a bot
      bots.forEach((bot, bIndex) => {
          let dx = bullet.x - bot.x;
          let dy = bullet.y - bot.y;
          if (Math.sqrt(dx*dx + dy*dy) < bot.size / 2 + BULLET_RADIUS) {
              bots.splice(bIndex, 1);
              bullets.splice(i, 1);
          }
      });
  });
  io.emit("updateBullets", bullets);
}

// Bot logic => chase nearest player => collisions => game over
function updateBots() {
    bots.forEach((bot) => {
        let closestPlayer = null;
        let closestDistance = Infinity;

        Object.values(players).forEach((player) => {
            const dx = player.x - bot.x;
            const dy = player.y - bot.y;
            const distance = Math.sqrt(dx*dx + dy*dy);
            if (distance < closestDistance) {
                closestPlayer = player;
                closestDistance = distance;
            }
        });

        if (closestPlayer) {
            const angle = Math.atan2(closestPlayer.y - bot.y, closestPlayer.x - bot.x);
            bot.x += Math.cos(angle) * BOT_SPEED;
            bot.y += Math.sin(angle) * BOT_SPEED;
            if (closestDistance < PLAYER_RADIUS + bot.size / 2) {
                io.emit("knockedOut", Date.now());
                return;
            }
        }
    });
    io.emit("updateBots", bots);
}

// Spawn coin logic (these become eggs on client)
function spawnCoin() {
    if (coins.length >= 5) return;
    coins.push({
        x: randomPositionWithinCanvas(15),
        y: -20,
        size: 10,
        speed: Math.random() * 2 + 1,
    });
    console.log("🪙 New Coin Spawned!");
}

function updateCoins() {
    coins.forEach((coin, i) => {
        coin.y += coin.speed;
        if (coin.y > CANVAS_HEIGHT) coins.shift();
    });
    io.emit("updateCoins", coins);
}

function isSafeFromPlayers(x, y, safeDistance) {
  // If no players exist, we can just say it's safe
  if (Object.keys(players).length === 0) return true;

  // Check distance from each player's position
  for (let pid of Object.keys(players)) {
    let p = players[pid];
    // if that player doesn't exist, skip
    if (!p) continue;
    let dx = p.x - x;
    let dy = p.y - y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < safeDistance) {
      return false; // Not safe
    }
  }
  return true; // If we never found a too-close player, it's safe
}

// ✅ (NEW) Wave System Updater => every 30 sec => new wave => spawn more bots/walls, etc.
function updateWaves() {
  waveTime += 1;
  // every 30 seconds, next wave => more frequent spawns, etc.
  if (waveTime >= 30) {
    waveTime = 0;
    currentWave += 1;
    console.log(`🌊 Wave ${currentWave} started! Spawning extra bots...`);
    // spawn a few extra bots at wave start
    for (let i = 0; i < currentWave; i++) {
      spawnBot();
    }
    // optionally spawn more walls or special obstacles too
    // generateMazeWalls(); // you can do partial new walls if wanted
  }
}

// intervals => spawn stuff, update bullets, collisions, etc.
setInterval(spawnCoin, 5000);
setInterval(updateCoins, 50);
setInterval(generateMazeWalls, 15000);
setInterval(spawnFood, 7000);
setInterval(spawnBot, 8000);
setInterval(updateBullets, 50);
setInterval(updateBots, 50);
setInterval(() => {
  checkCollisions();
  // emit updates to clients
  io.emit("updateGame", {
    players: Object.keys(players).reduce((acc, id) => {
      acc[id] = {
        ...players[id],
        coinsCollected: players[id].coinsCollected || 0,
      };
      return acc;
    }, {}),
    mazeWalls,
    foodItems,
    bots,
    bullets,
    coins,
    gameSpeedMultiplier,
    currentWave, // 🔴 send wave number to clients if you want them to display it
  });
}, 50);

// every second => wave system updates waveTime, triggers wave increments every 30s
setInterval(updateWaves, 1000);

// Speed up game by 20% every minute => players, bots, bullets, etc.
setInterval(() => {
    gameSpeedMultiplier *= 1.2;
    Object.values(players).forEach(player => player.speed *= 1.2);
    bots.forEach(bot => bot.speed *= 1.2);
    bullets.forEach(b => {
        b.dx *= 1.2;
        b.dy *= 1.2;
    });
    console.log(`🚀 Game Speed Increased by 20%! Multiplier: ${gameSpeedMultiplier}`);
}, 60000);

// Socket.io connections
io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("newPlayer", (username) => {
        players[socket.id] = {
            username,
            x: CANVAS_WIDTH / 2,
            y: CANVAS_HEIGHT - PLAYER_RADIUS - 10,
            radius: PLAYER_RADIUS,
            color: "#00ff99",
            speed: PLAYER_SPEED,
            coinsCollected: 0,
        };
        io.emit("updatePlayers", players);
    });

    socket.on("move", (data) => {
        const player = players[socket.id];
        if (!player) return;
        player.x += data.dx * player.speed;
        player.y += data.dy * player.speed;
        // clamp to canvas edges
        player.x = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, player.x));
        player.y = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, player.y));
        io.emit("updatePlayers", players);
    });

    socket.on("shoot", (data) => {
      bullets.push({
        x: data.x,
        y: data.y,
        dx: data.dx,
        dy: data.dy,
      });
      io.emit("updateBullets", bullets);
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        delete players[socket.id];
        io.emit("updatePlayers", players);
    });
});

server.listen(3000, () => console.log(`Server running on port 3000`));
