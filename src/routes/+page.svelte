<script>
  import { onMount } from 'svelte';

  let canvas;
  let ctx;
  let angle = 45;
  let power = 50;
  let projectile = null;
  let wind = 0; // placeholder for now

  const tank = {
    x: 50,
    y: 0,
    width: 40,
    height: 20
  };

  function fire() {
    const radians = (angle * Math.PI) / 180;
    const speed = power;
    const vx = Math.cos(radians) * speed;
    const vy = -Math.sin(radians) * speed;
    projectile = {
      x: tank.x + tank.width / 2,
      y: canvas.height - 20 - tank.height,
      vx,
      vy,
      gravity: 0.5
    };
  }

  function updateProjectile() {
    if (!projectile) return;
    projectile.vy += projectile.gravity;
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
  }

  function drawTank() {
    ctx.fillStyle = 'gray';
    ctx.fillRect(tank.x, canvas.height - 20 - tank.height, tank.width, tank.height);
    ctx.beginPath();
    const turretLength = 20;
    const turretAngle = (angle * Math.PI) / 180;
    const turretX = tank.x + tank.width / 2;
    const turretY = canvas.height - 20 - tank.height;
    ctx.moveTo(turretX, turretY);
    ctx.lineTo(turretX + Math.cos(turretAngle) * turretLength, turretY - Math.sin(turretAngle) * turretLength);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'lightblue';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'green';
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

    drawTank();

    if (projectile) {
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'red';
      ctx.fill();
    }
  }

  function loop() {
    updateProjectile();
    draw();
    requestAnimationFrame(loop);
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 400;
    tank.y = canvas.height - 20 - tank.height;
    draw();
    loop();
  });
</script>

<div class="controls">
  <label>
    Angle: <input type="range" min="0" max="90" bind:value={angle} /> {angle}
  </label>
  <label>
    Power: <input type="range" min="10" max="100" bind:value={power} /> {power}
  </label>
  <button on:click={fire}>Fire</button>
</div>

<canvas bind:this={canvas} class="border mt-4" style="border: 1px solid black"></canvas>

<style>
  .controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
</style>
