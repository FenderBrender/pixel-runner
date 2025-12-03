(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const closeHelp = document.getElementById('closeHelp');

  const GROUND_Y = 300;
  const MAX_JUMP_HEIGHT = 80;

  const SPIKE_W = 40;
  const SPIKE_H = 40;

  const HERO_FRAME_COUNT = 4;
  const HERO_FRAME_DURATION = 0.1;
  const HERO_FRAME_W = 32;
  const HERO_FRAME_H = 32;
  let heroFrame = 0;
  let heroFrameTimer = 0;

  const COIN_MIN_Y = GROUND_Y - MAX_JUMP_HEIGHT * 2;
  const COIN_MAX_Y = GROUND_Y;

  const COIN_FRAME_COUNT = 6;
  const COIN_FRAME_DURATION = 0.08;
  const COIN_FRAME_W = 16;
  const COIN_FRAME_H = 16;

  let coinFrame = 0;
  let coinFrameTimer = 0;

  const keys = new Set();
  const hero = { x: 50, y: GROUND_Y, w: 40, h: 40, vy: 0, onGround: true, jumpsLeft: 2 };
  const world = { score: 0, lives: 3, hero, coins: [], spikes: [] };

  let last = performance.now();
  let spaceWasDown = false;

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

  function spawn() {
    if (Math.random() < 0.03) {
      const coinY = (COIN_MIN_Y + Math.random() * (COIN_MAX_Y - COIN_MIN_Y)) | 0;
      world.coins.push({
        x: canvas.width + 20,
        y: coinY,
        w: 24,
        h: 24
      });
    }
    if (Math.random() < 0.02) {
      world.spikes.push({
        x: canvas.width + 10,
        y: GROUND_Y + hero.h - SPIKE_H,
        w: SPIKE_W,
        h: SPIKE_H
      });
    }
  }

  function aabb(a, b) {
    return !(
      a.x + a.w < b.x ||
      b.x + b.w < a.x ||
      a.y + a.h < b.y ||
      b.y + b.h < a.y
    );
  }

  function update(dt){
    const speed = 220;
    const spaceDown = keys.has('Space');

    if (keys.has('ArrowRight')) hero.x += speed * dt;
    if (keys.has('ArrowLeft'))  hero.x -= speed * dt;

    // --- double jump with edge detection ---
    if (spaceDown && !spaceWasDown && hero.jumpsLeft > 0) {
      hero.vy = -380;
      hero.onGround = false;
      hero.jumpsLeft--;
      jumpSfx.currentTime = 0;
      jumpSfx.play();
    }
    spaceWasDown = spaceDown;

    hero.vy += 900 * dt;
    hero.y += hero.vy * dt;
    if (hero.y >= GROUND_Y) {
      hero.y = GROUND_Y;
      hero.vy = 0;
      hero.onGround = true;
      hero.jumpsLeft = 2;   // reset both jumps when landing
    }


    spawn();
    world.coins.forEach(c => (c.x -= 200 * dt));
    world.spikes.forEach(s => (s.x -= 220 * dt));

    world.coins = world.coins.filter(c => {
      if (!aabb(hero, c)) return true;
      world.score++;
      coinSfx.currentTime = 0;
      coinSfx.play();
      return false;
    });

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
    }

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
    // background
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    // ground
    const groundY = GROUND_Y + hero.h; // 300 + 32 = 332
    ctx.fillStyle = "#111";
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

    // coins (animated)
    world.coins.forEach(c => {
      const sy = 0;
      const sx = coinFrame * COIN_FRAME_W;
      ctx.drawImage(
        coinSheet,
        sx, 0, COIN_FRAME_W, COIN_FRAME_H,   
        c.x, c.y, c.w, c.h                   
      );
    });

    // spikes
    world.spikes.forEach(s => {
      ctx.drawImage(spikeImg, s.x, s.y, s.w, s.h);
    });

    // hero (animated)
    {
      const sy = 0;
      const sx = heroFrame * HERO_FRAME_W;
      ctx.drawImage(
        heroSheet,
        sx, 0, HERO_FRAME_W, HERO_FRAME_H, 
        hero.x, hero.y, hero.w, hero.h
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

  let paused = false;
  let gameOver = false;

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
    world.coins = [];
    world.spikes = [];
    last = performance.now();
    paused = false;
    gameOver = false;
    heroFrame = 0;
    heroFrameTimer = 0;
    coinFrame = 0;
    coinFrameTimer = 0;
    spaceWasDown = false;
  }

  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'r') start();
  });

  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'p') paused = !paused;
  });

  window.addEventListener('keydown', e =>
    keys.add(e.code === 'Space' ? 'Space' : e.key)
  );

  window.addEventListener('keyup', e =>
    keys.delete(e.code === 'Space' ? 'Space' : e.key)
  );

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && helpModal.hidden === true) {
      helpModal.hidden = false;
      if (!paused) paused = !paused;
    } else if (e.key === 'Escape' && helpModal.hidden === false) {
      helpModal.hidden = true;
      if (paused) paused = !paused;
    }
  });

  if (helpBtn && helpModal && closeHelp) {
    helpBtn.addEventListener('click', () => {
      helpModal.hidden = false;
      if (!paused) paused = !paused;
    });

    closeHelp.addEventListener('click', () => {
      helpModal.hidden = true;
      if (paused) paused = !paused;
    });
  }

  loop();
})();
