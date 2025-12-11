(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeHelp = document.getElementById("closeHelp");

  // --- Constants ---
  const GROUND_Y = 300;          // hero.y when on ground
  const MAX_JUMP_HEIGHT = 80;

  const SPIKE_W = 40;
  const SPIKE_H = 40;

  const HERO_FRAME_COUNT = 4;
  const HERO_FRAME_DURATION = 0.1;
  const HERO_FRAME_W = 32;
  const HERO_FRAME_H = 32;
  let heroFrame = 0;
  let heroFrameTimer = 0;

  const COIN_FRAME_COUNT = 6;
  const COIN_FRAME_DURATION = 0.08;
  const COIN_FRAME_W = 16;
  const COIN_FRAME_H = 16;
  let coinFrame = 0;
  let coinFrameTimer = 0;

  // Platform constants
  const PLATFORM_W = 200;
  const PLATFORM_H = 20;
  const PLATFORM_MIN_Y = GROUND_Y - 140; // higher in the air
  const PLATFORM_MAX_Y = GROUND_Y - 60;  // not too close to ground

  const SCROLL_SPEED = 220; // common speed for coins, spikes, platforms

  // --- World state ---
  const keys = new Set();
  const hero = {
    x: 50,
    y: GROUND_Y,
    w: 40,
    h: 40,
    vy: 0,
    onGround: true,
    jumpsLeft: 2,
  };
  const world = {
    score: 0,
    lives: 3,
    hero,
    coins: [],
    spikes: [],
    platform: null, // { x, y, w, h }
  };

  let last = performance.now();
  let spaceWasDown = false;

  let paused = false;
  let gameOver = false;

  // Timers for nicer spacing
  let coinTimer = 0;
  let coinInterval = 0.5; // will be randomized in start()
  let spikeTimer = 0;
  let spikeInterval = 1.2; // will be randomized in start()

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
  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function aabb(a, b) {
    return !(
      a.x + a.w < b.x ||
      b.x + b.w < a.x ||
      a.y + a.h < b.y ||
      b.y + b.h < a.y
    );
  }

  // Ground-based coin Y: reachable with double jump from ground
  function groundCoinY() {
    const highest = GROUND_Y - MAX_JUMP_HEIGHT * 2;
    const lowest = GROUND_Y; // at hero's ground level
    return highest + Math.random() * (lowest - highest);
  }

  // Platform-based coin Y:
  // From "max double jump from platform" down to ground,
  // but NOT inside a small vertical band around the platform surface.
  function platformCoinY(platform) {
    const highest = Math.max(0, platform.y - MAX_JUMP_HEIGHT * 2);
    const lowest = GROUND_Y;

    // "No-spawn" vertical band around the platform itself
    const bandTop = platform.y - 10;
    const bandBottom = platform.y + HERO_FRAME_H + 10;

    const safeBandTop = Math.max(highest, bandTop);
    const safeBandBottom = Math.min(lowest, bandBottom);

    const hasAbove = safeBandTop > highest;
    const hasBelow = safeBandBottom < lowest;

    if (hasAbove && hasBelow) {
      const above = Math.random() < 0.5;
      if (above) {
        const maxYForAbove = safeBandTop;
        return highest + Math.random() * (maxYForAbove - highest);
      } else {
        const minYForBelow = safeBandBottom;
        return minYForBelow + Math.random() * (lowest - minYForBelow);
      }
    } else if (hasAbove) {
      const maxYForAbove = safeBandTop;
      return highest + Math.random() * (maxYForAbove - highest);
    } else if (hasBelow) {
      const minYForBelow = safeBandBottom;
      return minYForBelow + Math.random() * (lowest - minYForBelow);
    }

    // Fallback
    return groundCoinY();
  }

  // Spawn spikes attached to a platform (called at platform spawn, off-screen)
  function spawnPlatformSpike(platform) {
    // exactly 1 spike in the middle of the platform
    const sx = platform.x + platform.w / 2 - SPIKE_W / 2;
    world.spikes.push({
      x: sx,
      y: platform.y + hero.h - SPIKE_H, // sits on platform surface
      w: SPIKE_W,
      h: SPIKE_H,
    });
  }

  function spawnCoin() {
    const spawnX = canvas.width + 40;

    let coinY;
    if (
      world.platform &&
      spawnX >= world.platform.x &&
      spawnX <= world.platform.x + world.platform.w
    ) {
      // Platform covers this X
      coinY = platformCoinY(world.platform);
    } else {
      // No platform at this X
      coinY = groundCoinY();
    }

    world.coins.push({
      x: spawnX,
      y: coinY,
      w: 24,
      h: 24,
    });
  }

  function spawnSpike() {
    const spawnX = canvas.width + 40;
    world.spikes.push({
      x: spawnX,
      y: GROUND_Y + hero.h - SPIKE_H, // sits on ground
      w: SPIKE_W,
      h: SPIKE_H,
    });
  }

  function maybeSpawnPlatform() {
    if (!world.platform && Math.random() < 0.004) {
      const spawnX = canvas.width + 40;
      const py =
        PLATFORM_MIN_Y + Math.random() * (PLATFORM_MAX_Y - PLATFORM_MIN_Y);
      const platform = {
        x: spawnX,
        y: py,
        w: PLATFORM_W,
        h: PLATFORM_H,
      };
      world.platform = platform;

      // One platform spike, created off-screen so it scrolls in together
      spawnPlatformSpike(platform);
    }
  }

  // --- Update ---
  function update(dt) {
    const speed = 220;
    const spaceDown = keys.has("Space");

    if (keys.has("ArrowRight")) hero.x += speed * dt;
    if (keys.has("ArrowLeft")) hero.x -= speed * dt;

    hero.x = Math.max(0, Math.min(canvas.width - hero.w, hero.x));

    // double jump with edge detection
    if (spaceDown && !spaceWasDown && hero.jumpsLeft > 0) {
      hero.vy = -380;
      hero.onGround = false;
      hero.jumpsLeft--;
      jumpSfx.currentTime = 0;
      jumpSfx.play();
    }
    spaceWasDown = spaceDown;

    // Gravity
    hero.vy += 900 * dt;
    hero.y += hero.vy * dt;

    let landed = false;
    const vyAfter = hero.vy;
    const heroBottom = hero.y + hero.h;

    // Ground collision
    if (hero.y >= GROUND_Y) {
      hero.y = GROUND_Y;
      hero.vy = 0;
      landed = true;
    }

    // Platform collision (landing from above only)
    if (world.platform) {
      const p = world.platform;
      const platformTop = p.y + hero.h; // hero bottom position when standing
      const horizontallyOverPlatform =
        hero.x + hero.w > p.x && hero.x < p.x + p.w;

      if (
        vyAfter >= 0 && // falling
        horizontallyOverPlatform &&
        heroBottom >= platformTop - 10 &&
        heroBottom <= platformTop + 10
      ) {
        hero.y = p.y;
        hero.vy = 0;
        landed = true;
      }
    }

    hero.onGround = landed;
    if (landed) {
      hero.jumpsLeft = 2;
    }

    // Timed spawning for more even distribution
    coinTimer += dt;
    if (coinTimer >= coinInterval) {
      coinTimer -= coinInterval;
      // UPDATED: spawn faster (0.25–0.6 instead of 0.35–0.7)
      coinInterval = randRange(0.25, 0.6);
      spawnCoin();
    }

    spikeTimer += dt;
    if (spikeTimer >= spikeInterval) {
      spikeTimer -= spikeInterval;
      // UPDATED: spawn faster (0.9–1.7 instead of 1.0–1.8)
      spikeInterval = randRange(0.9, 1.7);
      spawnSpike();
    }

    // Random chance to start a platform
    maybeSpawnPlatform();

    // Move coins, spikes, platform (same speed)
    world.coins.forEach((c) => (c.x -= SCROLL_SPEED * dt));
    world.spikes.forEach((s) => (s.x -= SCROLL_SPEED * dt));

    if (world.platform) {
      world.platform.x -= SCROLL_SPEED * dt;
      if (world.platform.x + world.platform.w < 0) {
        world.platform = null;
      }
    }

    // Remove off-screen
    world.coins = world.coins.filter((c) => c.x + c.w > 0);
    world.spikes = world.spikes.filter((s) => s.x + s.w > 0);

    // Coin collisions
    world.coins = world.coins.filter((c) => {
      if (!aabb(hero, c)) return true;
      world.score++;
      coinSfx.currentTime = 0;
      coinSfx.play();
      return false;
    });

    // Spike collisions
    world.spikes = world.spikes.filter((s) => {
      if (!aabb(hero, s)) return true;
      if (world.lives > 0) {
        world.lives--;
        hitSfx.currentTime = 0;
        hitSfx.play();
      }
      return false;
    });

    // Game over
    if (world.lives <= 0 && !gameOver) {
      world.lives = 0;
      gameOver = true;
      paused = true;
      gameoverSfx.currentTime = 0;
      gameoverSfx.play();
    }

    // Hero animation
    heroFrameTimer += dt;
    if (heroFrameTimer >= HERO_FRAME_DURATION) {
      heroFrameTimer -= HERO_FRAME_DURATION;
      heroFrame = (heroFrame + 1) % HERO_FRAME_COUNT;
    }

    // Coin animation
    coinFrameTimer += dt;
    if (coinFrameTimer >= COIN_FRAME_DURATION) {
      coinFrameTimer -= COIN_FRAME_DURATION;
      coinFrame = (coinFrame + 1) % COIN_FRAME_COUNT;
    }
  }

  // --- Draw ---
  function draw() {
    // background
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    // ground
    const groundY = GROUND_Y + hero.h;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

    // floating platform (same style as ground)
    if (world.platform) {
      const p = world.platform;
      const platformTop = p.y + hero.h;
      ctx.fillStyle = "#111";
      ctx.fillRect(p.x, platformTop, p.w, p.h);
    }

    // coins (animated)
    world.coins.forEach((c) => {
      const sx = coinFrame * COIN_FRAME_W;
      ctx.drawImage(
        coinSheet,
        sx,
        0,
        COIN_FRAME_W,
        COIN_FRAME_H,
        c.x,
        c.y,
        c.w,
        c.h
      );
    });

    // spikes
    world.spikes.forEach((s) => {
      ctx.drawImage(spikeImg, s.x, s.y, s.w, s.h);
    });

    // hero (animated)
    {
      const sx = heroFrame * HERO_FRAME_W;
      ctx.drawImage(
        heroSheet,
        sx,
        0,
        HERO_FRAME_W,
        HERO_FRAME_H,
        hero.x,
        hero.y,
        hero.w,
        hero.h
      );
    }

    // HUD
    document.getElementById("score").textContent = world.score;
    document.getElementById("lives").textContent = world.lives;

    // game over overlay
    if (gameOver) {
      ctx.fillStyle = "#000a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "20px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        "Game Over - Press R to restart",
        canvas.width / 2,
        canvas.height / 2
      );
    }
  }

  // --- Main loop ---
  function loop(now = performance.now()) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!paused && !gameOver) update(dt);
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
    last = performance.now();
    paused = false;
    gameOver = false;
    heroFrame = 0;
    heroFrameTimer = 0;
    coinFrame = 0;
    coinFrameTimer = 0;
    spaceWasDown = false;

    // Reset spawn timers with UPDATED faster ranges
    coinTimer = 0;
    coinInterval = randRange(0.25, 0.6);   // faster coins
    spikeTimer = 0;
    spikeInterval = randRange(0.9, 1.7);   // faster spikes
  }

  // --- Input ---
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") start();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "p") paused = !paused;
  });

  window.addEventListener("keydown", (e) =>
    keys.add(e.code === "Space" ? "Space" : e.key)
  );

  window.addEventListener("keyup", (e) =>
    keys.delete(e.code === "Space" ? "Space" : e.key)
  );

  // ESC opens/closes help (and pauses)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && helpModal && helpModal.hidden === true) {
      helpModal.hidden = false;
      if (!paused) paused = !paused;
    } else if (e.key === "Escape" && helpModal && helpModal.hidden === false) {
      helpModal.hidden = true;
      if (paused) paused = !paused;
    }
  });

  if (helpBtn && helpModal && closeHelp) {
    helpBtn.addEventListener("click", () => {
      helpModal.hidden = false;
      if (!paused) paused = !paused;
    });

    closeHelp.addEventListener("click", () => {
      helpModal.hidden = true;
      if (paused) paused = !paused;
    });
  }

  // --- Start game ---
  start();
  loop();
})();
