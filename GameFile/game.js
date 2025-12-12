window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // Help UI (optional)
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeHelp = document.getElementById("closeHelp");

  // Menu UI
  const menuOverlay = document.getElementById("menuOverlay");
  const startBtn = document.getElementById("startBtn");
  const returnMenuBtn = document.getElementById("returnMenuBtn");

  // HUD
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");

  // --- Constants ---
  const GROUND_Y = 300;
  const MAX_JUMP_HEIGHT = 80;

  const SPIKE_W = 40;
  const SPIKE_H = 40;

  const HERO_FRAME_COUNT = 4;
  const HERO_FRAME_DURATION = 0.1;
  const HERO_FRAME_W = 32;
  const HERO_FRAME_H = 32;

  const COIN_FRAME_COUNT = 6;
  const COIN_FRAME_DURATION = 0.08;
  const COIN_FRAME_W = 16;
  const COIN_FRAME_H = 16;

  // Platform constants
  const PLATFORM_W = 200;
  const PLATFORM_H = 20;
  const PLATFORM_MIN_Y = GROUND_Y - 140;
  const PLATFORM_MAX_Y = GROUND_Y - 60;

  const SCROLL_SPEED = 220;

  // --- State ---
  const keys = new Set();
  const hero = { x: 50, y: GROUND_Y, w: 40, h: 40, vy: 0, onGround: true, jumpsLeft: 2 };
  const world = { score: 0, lives: 3, hero, coins: [], spikes: [], platform: null };

  let last = performance.now();
  let spaceWasDown = false;

  let paused = true;     // start paused until Start Game
  let gameOver = false;
  let playing = false;   // gate updates

  // Timers for smoother spacing
  let coinTimer = 0;
  let coinInterval = 0.5;
  let spikeTimer = 0;
  let spikeInterval = 1.2;

  // Animation
  let heroFrame = 0;
  let heroFrameTimer = 0;
  let coinFrame = 0;
  let coinFrameTimer = 0;

  // --- Images ---
  const bgImg = new Image();
  bgImg.src = "../assets/bg.jpg";
  const heroSheet = new Image();
  heroSheet.src = "../assets/hero.png";
  const coinSheet = new Image();
  coinSheet.src = "../assets/coin.png";
  const spikeImg = new Image();
  spikeImg.src = "../assets/spike.png";

  // --- Sound Effects ---
  const jumpSfx = new Audio("../assets/sounds/jump.mp3");
  const coinSfx = new Audio("../assets/sounds/coin.mp3");
  const hitSfx = new Audio("../assets/sounds/hit.mp3");
  const gameoverSfx = new Audio("../assets/sounds/gameover.mp3");

  jumpSfx.volume = 0.5;
  coinSfx.volume = 0.5;
  hitSfx.volume = 0.6;
  gameoverSfx.volume = 0.8;

  // --- Helpers ---
  const randRange = (min, max) => min + Math.random() * (max - min);

  function aabb(a, b) {
    return !(
      a.x + a.w < b.x ||
      b.x + b.w < a.x ||
      a.y + a.h < b.y ||
      b.y + b.h < a.y
    );
  }

  function groundCoinY() {
    const highest = GROUND_Y - MAX_JUMP_HEIGHT * 2;
    const lowest = GROUND_Y;
    return highest + Math.random() * (lowest - highest);
  }

  function platformCoinY(platform) {
    const highest = Math.max(0, platform.y - MAX_JUMP_HEIGHT * 2);
    const lowest = GROUND_Y;

    // avoid spawning on the platform band
    const bandTop = platform.y - 10;
    const bandBottom = platform.y + HERO_FRAME_H + 10;

    const safeBandTop = Math.max(highest, bandTop);
    const safeBandBottom = Math.min(lowest, bandBottom);

    const hasAbove = safeBandTop > highest;
    const hasBelow = safeBandBottom < lowest;

    if (hasAbove && hasBelow) {
      if (Math.random() < 0.5) {
        return highest + Math.random() * (safeBandTop - highest);
      }
      return safeBandBottom + Math.random() * (lowest - safeBandBottom);
    }
    if (hasAbove) return highest + Math.random() * (safeBandTop - highest);
    if (hasBelow) return safeBandBottom + Math.random() * (lowest - safeBandBottom);

    return groundCoinY();
  }

  function spawnPlatformSpike(platform) {
    const sx = platform.x + platform.w / 2 - SPIKE_W / 2;
    world.spikes.push({
      x: sx,
      y: platform.y + hero.h - SPIKE_H,
      w: SPIKE_W,
      h: SPIKE_H,
    });
  }

  function spawnCoin() {
    const spawnX = canvas.width + 40;

    let y;
    if (world.platform && spawnX >= world.platform.x && spawnX <= world.platform.x + world.platform.w) {
      y = platformCoinY(world.platform);
    } else {
      y = groundCoinY();
    }

    world.coins.push({ x: spawnX, y, w: 24, h: 24 });
  }

  function spawnSpike() {
    const spawnX = canvas.width + 40;
    world.spikes.push({
      x: spawnX,
      y: GROUND_Y + hero.h - SPIKE_H,
      w: SPIKE_W,
      h: SPIKE_H,
    });
  }

  function maybeSpawnPlatform() {
    if (!world.platform && Math.random() < 0.004) {
      const spawnX = canvas.width + 40;
      const py = PLATFORM_MIN_Y + Math.random() * (PLATFORM_MAX_Y - PLATFORM_MIN_Y);
      world.platform = { x: spawnX, y: py, w: PLATFORM_W, h: PLATFORM_H };
      spawnPlatformSpike(world.platform);
    }
  }

  // --- Menu control ---
  function showMenu() {
    playing = false;
    paused = true;
    gameOver = false;
    if (menuOverlay) menuOverlay.hidden = false;
    if (returnMenuBtn) returnMenuBtn.hidden = true;
  }

  function startFromMenu() {
    // IMPORTANT: set these BEFORE start(), so update() runs
    playing = true;
    paused = false;
    gameOver = false;

    if (menuOverlay) menuOverlay.hidden = true;
    if (returnMenuBtn) returnMenuBtn.hidden = true;

    start(); // reset game state
  }

  // --- Core loop ---
  function update(dt) {
    const speed = 220;
    const spaceDown = keys.has("Space");

    if (keys.has("ArrowRight")) hero.x += speed * dt;
    if (keys.has("ArrowLeft")) hero.x -= speed * dt;
    hero.x = Math.max(0, Math.min(canvas.width - hero.w, hero.x));

    // jump (edge-detected)
    if (spaceDown && !spaceWasDown && hero.jumpsLeft > 0) {
      hero.vy = -380;
      hero.onGround = false;
      hero.jumpsLeft--;
      jumpSfx.currentTime = 0;
      jumpSfx.play();
    }
    spaceWasDown = spaceDown;

    // physics
    hero.vy += 900 * dt;
    hero.y += hero.vy * dt;

    let landed = false;
    const vyAfter = hero.vy;
    const heroBottom = hero.y + hero.h;

    // ground
    if (hero.y >= GROUND_Y) {
      hero.y = GROUND_Y;
      hero.vy = 0;
      landed = true;
    }

    // platform landing
    if (world.platform) {
      const p = world.platform;
      const platformTop = p.y + hero.h;
      const over = hero.x + hero.w > p.x && hero.x < p.x + p.w;

      if (vyAfter >= 0 && over && heroBottom >= platformTop - 10 && heroBottom <= platformTop + 10) {
        hero.y = p.y;
        hero.vy = 0;
        landed = true;
      }
    }

    hero.onGround = landed;
    if (landed) hero.jumpsLeft = 2;

    // timed spawns (your “+0.1 more” update)
    coinTimer += dt;
    if (coinTimer >= coinInterval) {
      coinTimer -= coinInterval;
      coinInterval = randRange(0.25, 0.6);
      spawnCoin();
    }

    spikeTimer += dt;
    if (spikeTimer >= spikeInterval) {
      spikeTimer -= spikeInterval;
      spikeInterval = randRange(0.9, 1.7);
      spawnSpike();
    }

    maybeSpawnPlatform();

    // move all at same speed
    world.coins.forEach(c => (c.x -= SCROLL_SPEED * dt));
    world.spikes.forEach(s => (s.x -= SCROLL_SPEED * dt));
    if (world.platform) {
      world.platform.x -= SCROLL_SPEED * dt;
      if (world.platform.x + world.platform.w < 0) world.platform = null;
    }

    // cull offscreen
    world.coins = world.coins.filter(c => c.x + c.w > 0);
    world.spikes = world.spikes.filter(s => s.x + s.w > 0);

    // coin collision
    world.coins = world.coins.filter(c => {
      if (!aabb(hero, c)) return true;
      world.score++;
      coinSfx.currentTime = 0;
      coinSfx.play();
      return false;
    });

    // spike collision
    world.spikes = world.spikes.filter(s => {
      if (!aabb(hero, s)) return true;
      if (world.lives > 0) {
        world.lives--;
        hitSfx.currentTime = 0;
        hitSfx.play();
      }
      return false;
    });

    if (world.lives <= 0 && !gameOver) {
      world.lives = 0;
      gameOver = true;
      paused = true;
      gameoverSfx.currentTime = 0;
      gameoverSfx.play();

      // show return menu option
      if (returnMenuBtn) returnMenuBtn.hidden = false;
    }

    // animations
    heroFrameTimer += dt;
    if (heroFrameTimer >= HERO_FRAME_DURATION) {
      heroFrameTimer -= HERO_FRAME_DURATION;
      heroFrame = (heroFrame + 1) % HERO_FRAME_COUNT;
    }

    coinFrameTimer += dt;
    if (coinFrameTimer >= COIN_FRAME_DURATION) {
      coinFrameTimer -= COIN_FRAME_DURATION;
      coinFrame = (coinFrame + 1) % COIN_FRAME_COUNT;
    }
  }

  function draw() {
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    // ground
    const groundY = GROUND_Y + hero.h;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

    // platform
    if (world.platform) {
      const p = world.platform;
      const platformTop = p.y + hero.h;
      ctx.fillStyle = "#111";
      ctx.fillRect(p.x, platformTop, p.w, p.h);
    }

    // coins
    world.coins.forEach(c => {
      const sx = coinFrame * COIN_FRAME_W;
      ctx.drawImage(coinSheet, sx, 0, COIN_FRAME_W, COIN_FRAME_H, c.x, c.y, c.w, c.h);
    });

    // spikes
    world.spikes.forEach(s => ctx.drawImage(spikeImg, s.x, s.y, s.w, s.h));

    // hero
    const hsx = heroFrame * HERO_FRAME_W;
    ctx.drawImage(heroSheet, hsx, 0, HERO_FRAME_W, HERO_FRAME_H, hero.x, hero.y, hero.w, hero.h);

    // HUD
    if (scoreEl) scoreEl.textContent = world.score;
    if (livesEl) livesEl.textContent = world.lives;

    // game over overlay
    if (gameOver) {
      ctx.fillStyle = "#000a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "20px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Game Over - Press R to restart", canvas.width / 2, canvas.height / 2);
    }
  }

  function loop(now = performance.now()) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    // Only update when Start has been pressed
    if (!paused && !gameOver && playing) update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  function start() {
    world.score = 0;
    world.lives = 3;

    hero.x = 50;
    hero.y = GROUND_Y;
    hero.vy = 0;
    hero.onGround = true;
    hero.jumpsLeft = 2;

    world.coins = [];
    world.spikes = [];
    world.platform = null;

    heroFrame = 0;
    heroFrameTimer = 0;
    coinFrame = 0;
    coinFrameTimer = 0;

    spaceWasDown = false;
    last = performance.now();

    // reset spawn timers
    coinTimer = 0;
    coinInterval = randRange(0.25, 0.6);
    spikeTimer = 0;
    spikeInterval = randRange(0.9, 1.7);
  }

  // --- Inputs ---
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") {
      // restart only if in-game
      if (playing) {
        paused = false;
        gameOver = false;
        if (returnMenuBtn) returnMenuBtn.hidden = true;
        start();
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "p" && playing && !gameOver) paused = !paused;
  });

  window.addEventListener("keydown", (e) =>
    keys.add(e.code === "Space" ? "Space" : e.key)
  );
  window.addEventListener("keyup", (e) =>
    keys.delete(e.code === "Space" ? "Space" : e.key)
  );

  // ESC help (pause/resume)
  window.addEventListener("keydown", (e) => {
    if (!helpModal) return;
    if (e.key === "Escape" && helpModal.hidden === true) {
      helpModal.hidden = false;
      if (playing && !paused) paused = true;
    } else if (e.key === "Escape" && helpModal.hidden === false) {
      helpModal.hidden = true;
      if (playing && paused && !gameOver) paused = false;
    }
  });

  if (helpBtn && helpModal && closeHelp) {
    helpBtn.addEventListener("click", () => {
      helpModal.hidden = false;
      if (playing && !paused) paused = true;
    });

    closeHelp.addEventListener("click", () => {
      helpModal.hidden = true;
      if (playing && paused && !gameOver) paused = false;
    });
  }

  // Menu buttons
  if (startBtn) startBtn.addEventListener("click", startFromMenu);
  if (returnMenuBtn) returnMenuBtn.addEventListener("click", showMenu);

  // Start in menu
  showMenu();
  loop();
});
