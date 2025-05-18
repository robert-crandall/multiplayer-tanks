<script>
  import { onMount } from 'svelte';
  import { io } from 'socket.io-client';

  let canvas;
  let ctx;
  let angle = 45; // Default to pointing right and up (0=up, 90=right, -90=left)
  let power = 50;
  let projectile = null;
  let wind = 0; // placeholder for now

  const tank = {
    x: 50, // Initial position, will be set by server
    y: 0,  // Will be adjusted based on canvas height
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
    
    const turretLength = 20;
    const turretX = tank.x + tank.width / 2;
    const turretY = canvas.height - 20 - tank.height;
    const projectileStartX = turretX + Math.cos(radians) * turretLength;
    const projectileStartY = turretY - Math.sin(radians) * turretLength;
    
    projectile = {
      x: projectileStartX,
      y: projectileStartY,
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
    
    // Converting angle (0=up, -90=left, 90=right) to standard radians
    const adjustedAngle = 90 - angle; // This converts our system to standard angle (0=right, 90=up)
    const turretAngle = (adjustedAngle * Math.PI) / 180;
    
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

    drawTank(tank, angle);
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
      
      // Set our own tank position from server data
      if (existingPlayers[id] && existingPlayers[id].tank) {
        tank.x = existingPlayers[id].tank.x;
        tank.color = existingPlayers[id].tank.color || 'gray';
      }
      
      // Get other players
      players = { ...existingPlayers };
      delete players[playerId];
      
      // Ensure y position is correct for all tanks
      if (canvas) {
        for (const pid in players) {
          if (players[pid].tank) {
            players[pid].tank.y = canvas.height - 20 - players[pid].tank.height;
          }
        }
      }
    });

    socket.on('player-joined', ({ id, data }) => {
      // Use the tank data sent from the server
      players[id] = data;
      // Make sure y position is set correctly
      if (players[id].tank && canvas) {
        players[id].tank.y = canvas.height - 20 - players[id].tank.height;
      }
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
    
    // Set up socket first to get tank position from server
    setupSocket();
    
    // Start the game loop
    draw();
    loop();
  });
</script>

<div class="controls">
  <div class="angle-control">
    <label>
      Angle: <input type="range" min="-90" max="90" bind:value={angle} /> {angle}°
    </label>
  </div>
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
  
  .angle-control {
    display: flex;
    flex-direction: column;
  }
  
  .angle-indicators {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #555;
    margin-top: -5px;
  }
</style>
