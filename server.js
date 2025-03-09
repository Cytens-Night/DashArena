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

/**********************
 * ORIGINAL GLOBAL ARRAYS (commented out for separate sessions)
 **********************/
// const players = {};
// let bullets = [];
// let mazeWalls = [];
// let foodItems = [];
// let bots = [];
// let coins = []; 
// let gameSpeedMultiplier = 1;
// let currentWave = 1;
// let waveTime = 0;

/**********************
 * ***** PER-USER REWRITE *****
 * We'll store each user's game data in `sessions[socketId]`
 * so each connected user has their own data. 
 **********************/
let sessions = {}; // maps socket.id => { players, bullets, walls, etc. }

/**********************
 * HELPER: Create a fresh game session for a user
 **********************/
function createSession(socketId) {
  sessions[socketId] = {
    // single 'players' object for just this user 
    players: {},
    bullets: [],
    mazeWalls: [],
    foodItems: [],
    bots: [],
    coins: [],
    gameSpeedMultiplier: 1,
    currentWave: 1,
    waveTime: 0
  };
}

/**********************
 * HELPER: Hard reset for a user's game data
 * (We won't use this now, but we leave it in.)
 **********************/
function resetSession(socketId) {
  const s = sessions[socketId];
  if (!s) return;
  console.log("🔄 Resetting session for user:", socketId);

  s.bullets = [];
  s.bots = [];
  s.coins = [];
  s.mazeWalls = [];
  s.foodItems = [];
  s.currentWave = 1;
  s.waveTime = 0;
  s.gameSpeedMultiplier = 1;
}

/**********************
 * HELPER: randomPositionWithinCanvas
 **********************/
function randomPositionWithinCanvas(size) {
  return Math.random() * (CANVAS_WIDTH - size) + size / 2;
}

/**********************
 * ***** PER-USER SPAWN / UPDATE FUNCTIONS *****
 **********************/

function isSafeFromPlayer(s, x, y, safeDistance) {
  for (let pid in s.players) {
    let p = s.players[pid];
    let dx = p.x - x;
    let dy = p.y - y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < safeDistance) return false;
  }
  return true;
}

function spawnCoin(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return; // no player => skip

  if (s.coins.length >= 5) return;
  let x = randomPositionWithinCanvas(15);
  let speed = Math.random() * 2 + 1;
  s.coins.push({
    x, 
    y: -20,
    size: 10,
    speed: speed
  });
}

function updateCoins(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return; 

  s.coins.forEach((coin, i) => {
    coin.y += coin.speed;
  });
  s.coins = s.coins.filter(c => c.y <= CANVAS_HEIGHT);
}

function spawnBot(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return;

  let safeZone = 150;
  let botX, botY;
  let tries = 0;
  do {
    botX = randomPositionWithinCanvas(20);
    botY = randomPositionWithinCanvas(20);
    tries++;
    if (tries > 100) break;
  } while (!isSafeFromPlayer(s, botX, botY, safeZone));

  s.bots.push({
    x: botX,
    y: botY,
    size: 20,
    speed: BOT_SPEED,
  });
}

function spawnFood(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return;

  if (s.foodItems.length >= 3) return;
  const fruitEmojis = ["🍏", "🍎", "🍌", "🍉", "🍒", "🍇", "🍓", "🥭", "🍍", "🥝"];
  let randomFruit = fruitEmojis[Math.floor(Math.random() * fruitEmojis.length)];
  s.foodItems.push({
    x: randomPositionWithinCanvas(15),
    y: randomPositionWithinCanvas(15),
    size: 15,
    emoji: randomFruit
  });
}

function spawnWalls(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return;

  s.mazeWalls = [];
  const imagesArray = ["planet1","planet2","wall1","wall2","wall3"];
  for (let i = 0; i < 10; i++) {
    let safeZone = 150;
    let randPick = imagesArray[Math.floor(Math.random() * imagesArray.length)];
    let wallX, wallY;
    let tries = 0;
    do {
      wallX = randomPositionWithinCanvas(100);
      wallY = randomPositionWithinCanvas(100);
      tries++;
      if (tries > 100) break;
    } while (!isSafeFromPlayer(s, wallX, wallY, safeZone));

    s.mazeWalls.push({
      x: wallX,
      y: wallY,
      width: Math.random() * 100 + 30,
      height: Math.random() * 50 + 20,
      imageName: randPick
    });
  }
}

function updateBullets(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return;

  s.bullets.forEach((bullet, i) => {
    bullet.x += bullet.dx * BULLET_SPEED;
    bullet.y += bullet.dy * BULLET_SPEED;
  });
  s.bullets = s.bullets.filter(b => b.x > 0 && b.x < CANVAS_WIDTH && b.y > 0 && b.y < CANVAS_HEIGHT);

  // bullet hits bots
  s.bullets.forEach((bullet, i) => {
    s.bots.forEach((bot, bIndex) => {
      let dx = bullet.x - bot.x;
      let dy = bullet.y - bot.y;
      if (Math.sqrt(dx*dx + dy*dy) < bot.size/2 + BULLET_RADIUS) {
        s.bots.splice(bIndex, 1);
        s.bullets.splice(i,1);
      }
    });
  });
}

function updateBots(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return;

  s.bots.forEach(bot => {
    let closestPlayer = null;
    let closestDistance = Infinity;
    for (let pid in s.players) {
      let p = s.players[pid];
      let dx = p.x - bot.x;
      let dy = p.y - bot.y;
      let dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestPlayer = p;
      }
    }
    if (closestPlayer) {
      let angle = Math.atan2(closestPlayer.y - bot.y, closestPlayer.x - bot.x);
      bot.x += Math.cos(angle)*BOT_SPEED;
      bot.y += Math.sin(angle)*BOT_SPEED;
    }
  });
}

/**********************
 * 🔴 ADDED: checkCollisions => kill player if they collide with a BOT
 **********************/
function checkCollisions(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return;

  for (let pid in s.players) {
    let player = s.players[pid];

    // check food
    s.foodItems = s.foodItems.filter(food => {
      let dx = player.x - food.x;
      let dy = player.y - food.y;
      if (Math.sqrt(dx*dx + dy*dy) < player.radius + food.size) {
        let speedBoostTime = Math.floor(Math.random()*10)+1;
        let originalSpeed = player.speed;
        player.speed *= 1.5;
        setTimeout(() => {
          player.speed = originalSpeed;
        }, speedBoostTime * 1000);
        return false;
      }
      return true;
    });

    // check walls => game over
    s.mazeWalls.forEach(wall => {
      if (
        player.x + player.radius > wall.x &&
        player.x - player.radius < wall.x + wall.width &&
        player.y + player.radius > wall.y &&
        player.y - player.radius < wall.y + wall.height
      ) {
        console.log("🚨 Player hit a wall in their session:", socketId);
        io.to(socketId).emit("knockedOut", Date.now());
        delete s.players[pid];

        // 🔴 Instead of resetSession, we fully remove the session:
        delete sessions[socketId];
      }
    });

    // 🔴 check bots => if distance < radius+bot.size/2 => game over
    s.bots.forEach(bot => {
      let dx = player.x - bot.x;
      let dy = player.y - bot.y;
      let dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < player.radius + bot.size/2) {
        console.log("🚨 Player got eaten by a dragon in session:", socketId);
        io.to(socketId).emit("knockedOut", Date.now());
        delete s.players[pid];

        // 🔴 Also remove entire session => user truly restarts
        delete sessions[socketId];
      }
    });

    // check coins
    s.coins = s.coins.filter(coin => {
      let collected = false;
      for (let pid2 in s.players) {
        let p2 = s.players[pid2];
        let dx = p2.x - coin.x;
        let dy = p2.y - coin.y;
        if (Math.sqrt(dx*dx + dy*dy) < p2.radius + coin.size) {
          if (!p2.coinsCollected) p2.coinsCollected = 0;
          p2.coinsCollected++;
          collected = true;
          break;
        }
      }
      return !collected;
    });
  }
}

function updateWaves(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return;

  s.waveTime++;
  if (s.waveTime >= 30) {
    s.waveTime = 0;
    s.currentWave++;
    console.log("🌊 wave", s.currentWave, "for user:", socketId);
    for (let i=0; i<s.currentWave; i++){
      spawnBot(socketId);
    }
  }
}

function speedUpEveryMinute(socketId) {
  let s = sessions[socketId];
  if (!s) return;
  if (Object.keys(s.players).length === 0) return;

  s.gameSpeedMultiplier *= 1.2;
  for (let pid in s.players) {
    s.players[pid].speed *= 1.2;
  }
  s.bullets.forEach(b => {
    b.dx *= 1.2;
    b.dy *= 1.2;
  });
  s.bots.forEach(bot => {
    bot.speed *= 1.2;
  });
}

/**********************
 * intervals => we do a loop for each user
 **********************/
function spawnCoinForAll() {
  Object.keys(sessions).forEach(socketId => spawnCoin(socketId));
}
function updateCoinsForAll() {
  Object.keys(sessions).forEach(socketId => updateCoins(socketId));
}
function spawnWallsForAll() {
  Object.keys(sessions).forEach(socketId => spawnWalls(socketId));
}
function spawnFoodForAll() {
  Object.keys(sessions).forEach(socketId => spawnFood(socketId));
}
function spawnBotForAll() {
  Object.keys(sessions).forEach(socketId => spawnBot(socketId));
}
function updateBulletsForAll() {
  Object.keys(sessions).forEach(socketId => updateBullets(socketId));
}
function updateBotsForAll() {
  Object.keys(sessions).forEach(socketId => updateBots(socketId));
}
function checkCollisionsForAll() {
  Object.keys(sessions).forEach(socketId => checkCollisions(socketId));
}
function updateWavesForAll() {
  Object.keys(sessions).forEach(socketId => updateWaves(socketId));
}
function speedUpAll() {
  Object.keys(sessions).forEach(socketId => speedUpEveryMinute(socketId));
}

/**********************
 * "updateGame" => send each user their own data
 **********************/
function sendUpdatesToAll() {
  Object.keys(sessions).forEach(socketId => {
    let s = sessions[socketId];
    if (!s) return;
    if (Object.keys(s.players).length === 0) return;

    io.to(socketId).emit("updateGame", {
      players: s.players,
      mazeWalls: s.mazeWalls,
      foodItems: s.foodItems,
      bots: s.bots,
      bullets: s.bullets,
      coins: s.coins,
      gameSpeedMultiplier: s.gameSpeedMultiplier
    });
  });
}

// spawn intervals
setInterval(spawnCoinForAll, 5000);
setInterval(updateCoinsForAll, 50);
setInterval(spawnWallsForAll, 15000);
setInterval(spawnFoodForAll, 7000);
setInterval(spawnBotForAll, 8000);
setInterval(updateBulletsForAll, 50);
setInterval(updateBotsForAll, 50);

// collisions + updates
setInterval(() => {
  checkCollisionsForAll();
  sendUpdatesToAll();
}, 50);

// wave increment
setInterval(updateWavesForAll, 1000);

// speed up
setInterval(speedUpAll, 60000);

/**********************
 * Socket.io: each user => new session
 **********************/
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Create a fresh session
  createSession(socket.id);

  // single "player" object for them
  sessions[socket.id].players[socket.id] = {
    username: "temp",
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - PLAYER_RADIUS - 10,
    radius: PLAYER_RADIUS,
    speed: PLAYER_SPEED,
    coinsCollected: 0
  };

  socket.on("newPlayer", (username) => {
    // If the user has no session, create it again
    if (!sessions[socket.id]) {
      createSession(socket.id);
    }

    let s = sessions[socket.id];
    if (!s) return;
    let p = s.players[socket.id];
    if (p) {
      p.username = username;
    }
    io.to(socket.id).emit("updatePlayers", s.players);
  });

  socket.on("move", (data) => {
    let s = sessions[socket.id];
    if (!s) return;
    let p = s.players[socket.id];
    if (!p) return;
    p.x += data.dx * p.speed;
    p.y += data.dy * p.speed;
    // clamp
    p.x = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, p.y));
    io.to(socket.id).emit("updatePlayers", s.players);
  });

  socket.on("shoot", (data) => {
    let s = sessions[socket.id];
    if (!s) return;
    s.bullets.push({
      x: data.x,
      y: data.y,
      dx: data.dx,
      dy: data.dy
    });
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    delete sessions[socket.id];
  });
});

server.listen(3000, () => console.log(`Server running on port 3000`));
