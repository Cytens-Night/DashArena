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
const BULLET_HOLE_SIZE = 50;
const BOT_SPEED = 1.2;

const players = {};
let bullets = [];
let mazeWalls = [];
let foodItems = [];
let bots = [];
let coins = []; // ✅ Keep this line, REMOVE any duplicates
let gameSpeedMultiplier = 1; // 🔴 Base speed multiplier


// Generate random positions
function randomPositionWithinCanvas(size) {
    return Math.random() * (CANVAS_WIDTH - size) + size / 2;
}

// Generate maze walls at random positions
function generateMazeWalls() {
  mazeWalls = [];
  
  for (let i = 0; i < 10; i++) {
      let wallX, wallY, safeZone = 150; // 🔴 Keep walls 150px away from player

      do {
          wallX = randomPositionWithinCanvas(100);
          wallY = randomPositionWithinCanvas(100);
      } while (
          Math.abs(wallX - CANVAS_WIDTH / 2) < safeZone &&
          Math.abs(wallY - CANVAS_HEIGHT - 50) < safeZone
      );

      mazeWalls.push({
          x: wallX,
          y: wallY,
          width: Math.random() * 100 + 30,
          height: Math.random() * 50 + 20,
          color: "#8B0000",
      });
  }
}

// Spawn food
function spawnFood() {
  if (foodItems.length >= 3) return; // 🔴 Limit max food on screen

  const fruitEmojis = ["🍏", "🍎", "🍌", "🍉", "🍒", "🍇", "🍓", "🥭", "🍍", "🥝"]; // 🔴 Fruit choices
  let randomFruit = fruitEmojis[Math.floor(Math.random() * fruitEmojis.length)]; // 🔴 Pick random emoji

  foodItems.push({
      x: randomPositionWithinCanvas(15),
      y: randomPositionWithinCanvas(15),
      size: 15, // 🔴 Slightly larger for better visibility
      emoji: randomFruit, // 🔴 Store emoji
  });

  console.log(`🍏 New Food Spawned: ${randomFruit}`);
}


function checkCollisions() {
  Object.keys(players).forEach(playerID => {
      let player = players[playerID];

      // 🔴 Check if player eats food
      foodItems = foodItems.filter(food => {
          let dx = player.x - food.x;
          let dy = player.y - food.y;
          if (Math.sqrt(dx * dx + dy * dy) < player.radius + food.size) {
              console.log(`✅ Player ${player.username} ate ${food.emoji}!`);

              // 🔥 Give player a random speed boost for 1-10 seconds
              let speedBoostTime = Math.floor(Math.random() * 10) + 1;
              let originalSpeed = player.speed;
              player.speed *= 1.5; // 50% speed increase
              console.log(`🚀 Speed Boost! +50% for ${speedBoostTime}s`);

              setTimeout(() => {
                  player.speed = originalSpeed; // Restore speed after boost
                  console.log(`🔵 Speed Boost Ended.`);
              }, speedBoostTime * 1000);

              return false; // Remove the eaten food
          }
          return true; // Keep uneaten food
      });

      // 🔴 Check if player hits a wall (Game Over)
      mazeWalls.forEach(wall => {
          if (
              player.x + player.radius > wall.x &&
              player.x - player.radius < wall.x + wall.width &&
              player.y + player.radius > wall.y &&
              player.y - player.radius < wall.y + wall.height
          ) {
              console.log(`🚨 Player ${player.username} hit a wall! Game Over.`);
              io.to(playerID).emit("knockedOut", Date.now());
              delete players[playerID];
              io.emit("updatePlayers", players);
          }
      });

      // 🔴 Check if player collects a gold coin
      coins = coins.filter(coin => {
        let collected = false;
    
        Object.keys(players).forEach(playerID => {
            let player = players[playerID];
    
            let dx = player.x - coin.x;
            let dy = player.y - coin.y;
            if (Math.sqrt(dx * dx + dy * dy) < player.radius + coin.size) {
                console.log(`🪙 Player ${player.username} collected a coin!`);
                if (!player.coinsCollected) player.coinsCollected = 0; // ✅ Ensure coinsCollected is defined
                player.coinsCollected += 1; // ✅ Increase the player's coin count
                collected = true; // ✅ Remove collected coin
            }
        });
    
        return !collected; // ✅ Keep uncollected coins
    });
    

  });
}



// Spawn bots (enemies)
function spawnBot() {
    bots.push({
        x: randomPositionWithinCanvas(20),
        y: randomPositionWithinCanvas(20),
        size: 20,
        speed: BOT_SPEED,
        alive: true,
    });
}

// Handle bullets
function updateBullets() {
    bullets.forEach((bullet, bulletIndex) => {
        bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
        bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;

        if (bullet.x < 0 || bullet.x > CANVAS_WIDTH || bullet.y < 0 || bullet.y > CANVAS_HEIGHT) {
            bullets.splice(bulletIndex, 1);
            return;
        }

        // Bullet hits a bot
        bots.forEach((bot, botIndex) => {
            const dx = bullet.x - bot.x;
            const dy = bullet.y - bot.y;
            if (Math.sqrt(dx * dx + dy * dy) < bot.size / 2 + BULLET_RADIUS) {
                bots.splice(botIndex, 1);
                bullets.splice(bulletIndex, 1);
            }
        });
    });

    io.emit("updateBullets", bullets);
}

// Bot movement logic
function updateBots() {
    bots.forEach((bot) => {
        let closestPlayer = null;
        let closestDistance = Infinity;

        Object.values(players).forEach((player) => {
            const dx = player.x - bot.x;
            const dy = player.y - bot.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < closestDistance) {
                closestPlayer = player;
                closestDistance = distance;
            }
        });

        if (closestPlayer) {
            const angle = Math.atan2(closestPlayer.y - bot.y, closestPlayer.x - bot.x);
            bot.x += Math.cos(angle) * BOT_SPEED;
            bot.y += Math.sin(angle) * BOT_SPEED;

            // Collision with player
            if (closestDistance < PLAYER_RADIUS + bot.size / 2) {
                io.emit("knockedOut", Date.now());
                return;
            }
        }
    });

    io.emit("updateBots", bots);
}

function spawnCoin() {
    if (coins.length >= 5) return; // 🔴 Limit max coins on screen

    coins.push({
        x: randomPositionWithinCanvas(15),
        y: -20, // 🔴 Start above the screen
        size: 10,
        speed: Math.random() * 2 + 1, // 🔴 Random fall speed
    });

    console.log("🪙 New Coin Spawned!");
}

// 🔴 Move Coins Downward
function updateCoins() {
    coins.forEach(coin => {
        coin.y += coin.speed; // Move down

        // 🔴 Remove coin if it goes below screen
        if (coin.y > CANVAS_HEIGHT) {
            coins.shift();
        }
    });

    io.emit("updateCoins", coins);
}

// 🔴 Spawn new coins every 5 seconds
setInterval(spawnCoin, 5000);

// 🔴 Update falling coins movement every 50ms
setInterval(updateCoins, 50);


// Start game loops
setInterval(generateMazeWalls, 15000); // Regenerate maze every 15 sec
setInterval(spawnFood, 7000); // 🔴 Food appears every 12s instead of 7s
setInterval(spawnBot, 8000);
setInterval(updateBullets, 50);
setInterval(updateBots, 50);
setInterval(() => {
  checkCollisions(); // 🔴 Check for player-wall collisions
  io.emit("updateGame", {
    players: Object.keys(players).reduce((acc, id) => {
        acc[id] = {
            ...players[id],
            coinsCollected: players[id].coinsCollected || 0, // ✅ Ensure coin count is included
        };
        return acc;
    }, {}),
    mazeWalls,
    foodItems,
    bots,
    bullets,
    coins,
    gameSpeedMultiplier,
});

}, 50);



setInterval(() => {
    gameSpeedMultiplier *= 1.2; // 🔴 Increase speed by 20% every minute

    Object.values(players).forEach(player => player.speed *= 1.2);
    bots.forEach(bot => bot.speed *= 1.2);
    bullets.forEach(bullet => bullet.speed *= 1.2);

    console.log(`🚀 Game Speed Increased by 20%! Multiplier: ${gameSpeedMultiplier}`);
}, 60000); // Every 60 seconds


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

        player.x += data.dx * PLAYER_SPEED;
        player.y += data.dy * PLAYER_SPEED;

        player.x = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, player.x));
        player.y = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, player.y));

        io.emit("updatePlayers", players);
    });

    socket.on("shoot", (data) => {
        bullets.push({ x: data.x, y: data.y, angle: data.angle });
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        delete players[socket.id];
        io.emit("updatePlayers", players);
    });
});

server.listen(3000, () => console.log(`Server running on port 3000`));
