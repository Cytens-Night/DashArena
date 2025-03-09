/**********************
 * 1) INITIAL SETUP
 **********************/
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const pauseBtn = document.getElementById("pauseBtn");

/**********************
 * 2) GLOBAL VARIABLES
 **********************/
let players = {};
let mazeWalls = [];
let foodItems = [];
let bots = [];
let bullets = [];
let coins = []; 
let survivalTime = 0;
let paused = false;
let gameSpeedMultiplier = 1;
let currentFrame = 0; 
let frameTick = 0;
const frameSpeed = 6; 
const BULLET_RADIUS = 5;
let keys = { up: false, down: false, left: false, right: false }; 

// We'll track the player's name in localStorage
let storedName = localStorage.getItem("playerName") || ""; 
let clientStartTime = 0; // We'll set it in showAdAndStart()
let sessionActive = false; // If false, we stop drawing

/**********************
 * 3) BACKGROUND
 **********************/
const background = new Image();
background.src = "/Assets/Game_Background.png";
background.onload = () => {
  console.log("✅ Background Loaded!");
};

/**********************
 * 4) IMAGES & ANIMATIONS
 **********************/
// Existing images
const images = {
  idle: new Image(),
  crouching: new Image(),
  flying: new Image(),
  facingLeft: new Image(),
  facingRight: new Image(),
  shooting: new Image(),
};
images.idle.src = "/Assets/Facing Right.png";  
images.crouching.src = "/Assets/Crouching.png";
images.flying.src = "/Assets/Flying.png";
images.facingLeft.src = "/Assets/Facing Left.png";
images.facingRight.src = "/Assets/Facing Right.png";
images.shooting.src = "/Assets/Shooting.png";

// Bullet images
const bulletImages = {
  left: new Image(),
  right: new Image(),
  up: new Image(),
  down: new Image(),
};
bulletImages.left.src = "/Assets/Knive_Left.png";
bulletImages.right.src = "/Assets/Knive_right.png";
bulletImages.up.src = "/Assets/Knive_Up.png";
bulletImages.down.src = "/Assets/Knive_Down.png";

// Dragon for bots
const dragonLeftImg = new Image();
dragonLeftImg.src = "/Assets/Dragon_Attacking_Facing_left.png";
const dragonRightImg = new Image();
dragonRightImg.src = "/Assets/Dragon_Attacking_Facing_right.png";

// Egg images
const egg1 = new Image();
egg1.src = "/Assets/Fall_Dragon_Egg_1.png";
const egg2 = new Image();
egg2.src = "/Assets/Fall_Dragon_Egg_2.png";

// planet/wall images
const planet1 = new Image();
planet1.src = "/Assets/Random_Planet_1.png";
const planet2 = new Image();
planet2.src = "/Assets/Random_Planet_2.png";
const wall1 = new Image();
wall1.src = "/Assets/Random_Wall_1.png";
const wall2 = new Image();
wall2.src = "/Assets/Random_Wall_2.png";
const wall3 = new Image();
wall3.src = "/Assets/Random_Wall_3.png";

// Animations object
const animations = {
  idle: { frames: 1, image: images.idle },
  crouching: { frames: 1, image: images.crouching },
  flying: { frames: 1, image: images.flying },
  facingLeft: { frames: 1, image: images.facingLeft },
  facingRight: { frames: 1, image: images.facingRight },
  shooting: { frames: 1, image: images.shooting },
};
let currentAnimation = "idle"; 

// Audio references
let bgMusic = new Audio("/Assets/bgMusic.mp3");
let shootSound = new Audio("/Assets/shootSound.mp3"); 
let coinSound = new Audio("/Assets/coinSound.mp3"); 

/**********************
 * 5) TIMERS & INTERVALS
 **********************/
setInterval(() => {
  if (!paused && sessionActive) {
    survivalTime += 1;
  }
}, 1000);

setInterval(() => {
  console.clear();
  console.log("Players:", players);
  console.log("Walls:", mazeWalls);
  console.log("Food:", foodItems);
  console.log("Bots:", bots);
  console.log("Bullets:", bullets);
}, 2000);

/**********************
 * 6) SOCKET.IO EVENTS
 **********************/
socket.on("updateGame", (data) => {
  players = data.players || {};
  mazeWalls = data.mazeWalls || [];
  foodItems = data.foodItems || [];
  bots = data.bots || [];
  bullets = data.bullets || [];
  coins = data.coins || [];
  gameSpeedMultiplier = data.gameSpeedMultiplier || 1;

  let player = players[socket.id];
  if (player) {
    player.x = player.x || canvas.width / 2;
    player.y = player.y || canvas.height - 50;
    player.coinsCollected = player.coinsCollected || 0;
  }
});

// Bullets updates
socket.on("updateBullets", (serverBullets) => {
  bullets = serverBullets;
});

// Coins updates
socket.on("updateCoins", (serverCoins) => {
  coins = serverCoins;
});

// Knocked out => show end screen
socket.on("knockedOut", (time) => {
  cancelAnimationFrame(animationId); 
  sessionActive = false; 
  canvas.style.display = "none";
  document.getElementById("startContainer").style.display = "block";

  bgMusic.pause();
  bgMusic.currentTime = 0;

  let endScreen = document.getElementById("endScreen");
  let endStats = document.getElementById("endStats");
  endScreen.style.display = "block";

  let totalMs = Date.now() - clientStartTime; 
  let survivedSecs = Math.floor(totalMs / 1000);

  let eggsCollected = 0;
  let me = players[socket.id];
  if (me) eggsCollected = me.coinsCollected || 0;

  endStats.textContent = `You survived for ${survivedSecs} seconds and collected ${eggsCollected} eggs!`;
});

/**********************
 * 7) START & PAUSE
 **********************/
let animationId;
function showAdAndStart() {
  document.getElementById("endScreen").style.display = "none";
  bgMusic.play();
  const nameInput = document.getElementById("username");
  let user = nameInput ? nameInput.value : "";
  if (!user && storedName) {
    user = storedName;
  }
  if (!user) {
    alert("Please enter a name!");
    return;
  }
  storedName = user;
  localStorage.setItem("playerName", storedName);

  document.getElementById("startContainer").style.display = "none";
  canvas.style.display = "block";
  pauseBtn.style.display = "block";

  let helpBtn = document.getElementById("helpBtn");
  if (helpBtn) helpBtn.style.display = "block";

  survivalTime = 0;
  clientStartTime = Date.now();

  sessionActive = true;

  socket.emit("newPlayer", storedName);
  animate();
}

function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
}

/**********************
 * 8) PLAYER MOVEMENT
 **********************/
window.addEventListener("keydown", (e) => {
  if (!e || !e.key) return;
  const key = e.key.toLowerCase();

  switch (key) {
    case "arrowup": case "w": keys.up = true; break;
    case "arrowdown": case "s": keys.down = true; break;
    case "arrowleft": case "a": keys.left = true; break;
    case "arrowright": case "d": keys.right = true; break;
  }
});

window.addEventListener("keyup", (e) => {
  if (!e || !e.key) return;
  const key = e.key.toLowerCase();

  switch (key) {
    case "arrowup": case "w": keys.up = false; break;
    case "arrowdown": case "s": keys.down = false; break;
    case "arrowleft": case "a": keys.left = false; break;
    case "arrowright": case "d": keys.right = false; break;
  }
});

setInterval(() => {
  if (!paused && sessionActive) {
    let dx = 0, dy = 0;
    if (keys.up) dy = -1;
    if (keys.down) dy = 1;
    if (keys.left) dx = -1;
    if (keys.right) dx = 1;
    socket.emit("move", { dx, dy });
  }
}, 1000 / 60);

/**********************
 * 9) SHOOTING
 **********************/
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) { 
    shootBullet(e);
  }
});

function shootBullet(event) {
  const player = players[socket.id];
  if (!player) return;

  shootSound.currentTime = 0; 
  shootSound.play().catch(err => console.log(err));

  let rect = canvas.getBoundingClientRect();
  let mouseX = event.clientX - rect.left;
  let mouseY = event.clientY - rect.top;

  let angle = Math.atan2(mouseY - player.y, mouseX - player.x);
  let dx = Math.cos(angle) * 5; 
  let dy = Math.sin(angle) * 5;

  socket.emit("shoot", { x: player.x, y: player.y, dx, dy });
}

/**********************
 * 10) DRAW FUNCTIONS
 **********************/
function draw() {
  if (!sessionActive) return; 
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  drawMaze();
  drawFood();
  drawBots();
  drawBullets();
  drawCoins();
  drawPlayers();
  drawScoreboard();
}

// Maze
function drawMaze() {
  mazeWalls.forEach(wall => {
    if (!wall) return;
    let chosen = wall1; 
    switch (wall.imageName) {
      case "planet1": chosen = planet1; break;
      case "planet2": chosen = planet2; break;
      case "wall1": chosen = wall1; break;
      case "wall2": chosen = wall2; break;
      case "wall3": chosen = wall3; break;
      default: chosen = wall1; break;
    }
    ctx.drawImage(chosen, wall.x, wall.y, wall.width, wall.height);
  });
}

// Food
function drawFood() {
  foodItems.forEach(food => {
    if (!food.emoji) return;
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(food.emoji, food.x, food.y);
  });
}

// Bots
function drawBots() {
  bots.forEach(bot => {
    if (!bot) return;

    if (bot.oldX === undefined) {
      bot.oldX = bot.x;
    }
    let goingLeft = false;
    if (bot.x < bot.oldX) {
      goingLeft = true;
    }

    let chosenDragon = goingLeft ? dragonLeftImg : dragonRightImg;
    ctx.drawImage(chosenDragon, bot.x - 25, bot.y - 25, 50, 50);

    bot.oldX = bot.x;
  });
}

// Bullets
function drawBullets() {
  bullets.forEach(bullet => {
    if (!bullet) return;
    let bulletImage = bullet.dx < 0 ? bulletImages.left 
                    : bullet.dx > 0 ? bulletImages.right 
                    : bullet.dy < 0 ? bulletImages.up 
                    : bulletImages.down;
    ctx.drawImage(bulletImage, bullet.x - 5, bullet.y - 5, 10, 10);
  });
}

// Coins
function drawCoins() {
  coins.forEach((coin, index) => {
    let chosenEgg = (index % 2 === 0) ? egg1 : egg2;
    ctx.drawImage(chosenEgg, coin.x - 15, coin.y - 20, 30, 40);
  });
}

// Players
function drawPlayers() {
  Object.values(players).forEach(player => {
    if (!player || !player.x || !player.y) return;

    let playerImage = images.idle;
    let flipX = false;

    if (keys.down) {
      playerImage = images.crouching;
    } else if (keys.up) {
      playerImage = images.flying;
    } else if (keys.left) {
      playerImage = images.facingLeft;
      flipX = false; 
    } else if (keys.right) {
      playerImage = images.facingRight;
      flipX = false;
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    if (flipX) {
      ctx.scale(-1, 1);
      ctx.drawImage(playerImage, -25, -25, -40, 50);
    } else {
      ctx.drawImage(playerImage, -20, -25, 40, 50);
    }
    ctx.restore();
  });
}

// Scoreboard
function drawScoreboard() {
  let player = players[socket.id] || { coinsCollected: 0 };
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(canvas.width - 200, 10, 200, 100);
  ctx.font = "16px Orbitron";
  ctx.fillStyle = "#00ff99";
  ctx.fillText("⏳ Time: " + survivalTime + "s", canvas.width - 100, 35);
  ctx.fillText("🚀 Speed: " + gameSpeedMultiplier.toFixed(1) + "x", canvas.width - 90, 60);
  ctx.fillText("🥚 Eggs: " + player.coinsCollected, canvas.width - 105, 85);
}

/**********************
 * 11) ANIMATION LOOP
 **********************/
function animate() {
  animationId = requestAnimationFrame(animate);
  if (!paused && sessionActive) {
    draw();
    frameTick++;
    if (frameTick >= frameSpeed) {
      frameTick = 0;
      currentFrame = (currentFrame + 1) % animations[currentAnimation].frames;
    }
  }
}

/**********************
 * 12) END SCREEN & HELP POPUP
 **********************/
function playAgain() {
  document.getElementById("endScreen").style.display = "none";
  survivalTime = 0;
  paused = false;
  clientStartTime = Date.now();

  socket.emit("newPlayer", storedName);
  sessionActive = true;
  animate(); 
}

function exitGame() {
  document.getElementById("endScreen").style.display = "none";
  document.getElementById("startContainer").style.display = "block";
  let nameInput = document.getElementById("username");
  nameInput.value = storedName;

  canvas.style.display = "none";
  pauseBtn.style.display = "none";
  let helpBtn = document.getElementById("helpBtn");
  if (helpBtn) helpBtn.style.display = "none";

  cancelAnimationFrame(animationId); 
  paused = true;
  sessionActive = false;
  bgMusic.pause();
  bgMusic.currentTime = 0;
}

function toggleHelp() {
  let helpPopup = document.getElementById("helpPopup");
  if (!helpPopup) return;
  if (helpPopup.style.display === "block") {
    helpPopup.style.display = "none";
  } else {
    helpPopup.style.display = "block";
  }
}
