(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const keys = new Set();
  const hero = { x: 50, y: 300, w: 32, h: 32, vy: 0, onGround: true };
  let last = performance.now();

  function update(dt){
    const speed = 220;
    if (keys.has('ArrowRight')) hero.x += speed*dt;
    if (keys.has('ArrowLeft'))  hero.x -= speed*dt;
    if (keys.has('Space') && hero.onGround){ hero.vy = -380; hero.onGround = false; }
    hero.vy += 900*dt; hero.y += hero.vy*dt;
    if (hero.y >= 300){ hero.y=300; hero.vy=0; hero.onGround=true; }
  }
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0c1230'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#2a3b66'; ctx.fillRect(0,332,canvas.width,4);
    ctx.fillStyle='#7bd8ff'; ctx.fillRect(hero.x, hero.y, hero.w, hero.h);
  }
  function loop(now=performance.now()){
    const dt = Math.min(0.033,(now-last)/1000); last = now;
    update(dt); draw(); requestAnimationFrame(loop);
  }

  window.addEventListener('keydown', e => keys.add(e.code==='Space'?'Space':e.key));
  window.addEventListener('keyup',   e => keys.delete(e.code==='Space'?'Space':e.key));
  loop();
})();
