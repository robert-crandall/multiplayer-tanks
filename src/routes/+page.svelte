<script>
  import { onMount } from 'svelte';
  import { io } from 'socket.io-client';

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
    height: 20,
    color: 'gray'
  };

  let players = {}; // other players
  let socket;
  let playerId = null;

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

  function drawTank(t, angle, color = 'gray') {
    ctx.fillStyle = color;
    ctx.fillRect(t.x, canvas.height - 20 - t.height, t.width, t.height);
    ctx.beginPath();
    const turretLength = 20;
    const turretAngle = (angle * Math.PI) / 180;
    const turretX = t.x + t.width / 2;
    const turretY = canvas.height - 20 - t.height;
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

    drawTank(tank, angle, 'gray');
    for (const id in players) {
      const p = players[id];
      drawTank(p.tank, p.angle, 'blue');
    }

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

  function setupSocket() {
    socket = io('http://localhost:3001');

    socket.on('init', ({ id, players: existingPlayers }) => {
      playerId = id;
      players = { ...existingPlayers };
      delete players[playerId];
    });

    socket.on('player-joined', ({ id }) => {
      players[id] = { angle: 45, power: 50, tank: { x: 150, y: 0, width: 40, height: 20 } };
    });

    socket.on('player-updated', ({ id, data }) => {
      if (players[id]) players[id] = data;
    });

    socket.on('player-left', ({ id }) => {
      delete players[id];
    });
  }

  $: if (socket && playerId) {
    socket.emit('update-player', {
      angle,
      power,
      tank
    });
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 400;
    tank.y = canvas.height - 20 - tank.height;
    draw();
    loop();
    setupSocket();
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
