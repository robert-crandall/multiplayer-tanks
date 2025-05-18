<script>
  import { onMount } from 'svelte';
  import { io } from 'socket.io-client';

  let canvas;
  let ctx;
  let angle = 45; // Default to pointing right and up (0=up, 90=right, -90=left)
  let power = 50;
  let projectile = null;
  let wind = 0; // placeholder for now
  let terrainData; // Pixel-based terrain data
  let explosions = []; // Array to store active explosions for visual effect
  
  // Weapon types with different explosion radiuses
  const weaponTypes = {
    standard: { name: "Standard Shell", radius: 15, color: "red", damage: 25 },
    large: { name: "Large Shell", radius: 25, color: "orange", damage: 40 },
    small: { name: "Small Shell", radius: 8, color: "yellow", damage: 10 },
    hyper: { name: "HyperTech Shell", radius: 3, color: "blue", damage: 80 },
    nova: { name: "Nova Shell", radius: 50, color: "green", damage: 5 }
  };
  
  let currentWeapon = weaponTypes.standard; // Default weapon

  const tank = {
  x: 50,
  y: -40, // Start high above terrain
  vy: 0, // Vertical velocity
  width: 40,
  height: 20,
  color: 'gray',
  health: 100
};

// 2. In your draw or loop function, add this gravity logic:
function updateTankGravity() {
  // Only apply gravity if tank is not destroyed
  if (tank.destroyed) return;

  // Gravity constant
  const gravity = 0.7;

  // Find the terrain surface under the tank's center
  const tankBottomX = tank.x + tank.width / 2;
  const terrainY = getTerrainYAt(tankBottomX);

  // If tank is above terrain, apply gravity
  if (tank.y + tank.height < terrainY) {
    tank.vy += gravity;
    tank.y += tank.vy;

    // Clamp so tank doesn't go through terrain
    if (tank.y + tank.height > terrainY) {
      tank.y = terrainY - tank.height;
      tank.vy = 0;
    }
  } else {
    // On terrain, reset vy
    tank.y = terrainY - tank.height;
    tank.vy = 0;
  }
}



  let players = {}; // other players
  let socket;
  let playerId = null;
  let heights = [];

 function initTerrain() {
  const terrainHeight = 20;
  const minTerrainHeight = 60; // Minimum flat strip height from the bottom
  terrainData = new ImageData(canvas.width, canvas.height);

  // Generate a height map for the terrain using sine waves and randomness
  for (let x = 0; x < canvas.width; x++) {
    // Flat strip at the bottom
    const base = canvas.height - minTerrainHeight;
    // Add hills/noise on top of the flat strip
    const hill = Math.sin(x / 80) * 18 + Math.sin(x / 23) * 7;
    const noise = Math.random() * 6 - 3;
    // The higher the value, the higher the terrain (closer to the top)
    let height = Math.floor(base - terrainHeight - hill - noise);
    // Clamp so terrain never goes below the flat strip
    height = Math.min(height, base);
    heights[x] = Math.max(0, Math.min(canvas.height, height));
  }

  // Initialize with transparent pixels
  for (let i = 0; i < terrainData.data.length; i += 4) {
    terrainData.data[i] = 0;
    terrainData.data[i + 1] = 0;
    terrainData.data[i + 2] = 0;
    terrainData.data[i + 3] = 0;
  }

  // Set terrain pixels as green, following the generated height map
  for (let x = 0; x < canvas.width; x++) {
    // Fill from the calculated height down to the bottom
    for (let y = heights[x]; y < canvas.height; y++) {
      const index = (y * canvas.width + x) * 4;
      terrainData.data[index] = 0;
      terrainData.data[index + 1] = 128;
      terrainData.data[index + 2] = 0;
      terrainData.data[index + 3] = 255;
    }
  }
}

  // Helper to get terrain surface y at a given x
  function getTerrainYAt(x) {
    x = Math.floor(x);
    if (x < 0) x = 0;
    if (x >= heights.length) x = heights.length - 1;
    return heights[x];
  }

  // Helper to snap a tank to the terrain
  function snapTankToTerrain(tankObj) {
    tankObj.y = 0;
    tankObj.y = getTerrainYAt(tankObj.x + tankObj.width / 2) - tankObj.height;
  }

  // Get pixel color at position
  function getPixel(x, y) {
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      return [0, 0, 0, 0]; // Out of bounds
    }
    const index = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
    return [
      terrainData.data[index],
      terrainData.data[index + 1],
      terrainData.data[index + 2],
      terrainData.data[index + 3]
    ];
  }

  // Modify terrain at explosion point
  function destroyTerrain(x, y, radius) {
    // Loop through pixels in a square around the explosion
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const dx = x + i;
        const dy = y + j;
        
        // Check if within canvas bounds
        if (dx >= 0 && dx < canvas.width && dy >= 0 && dy < canvas.height) {
          // Calculate distance from center
          const distance = Math.sqrt(i * i + j * j);
          
          // If within explosion radius, remove terrain
          if (distance <= radius) {
            const index = (Math.floor(dy) * canvas.width + Math.floor(dx)) * 4;
            terrainData.data[index + 3] = 0; // Make transparent
          }
        }
      }
    }
  }

  function fire() {
    // Prevent firing if the tank is destroyed
    if (tank.destroyed) {
      return;
    }
    
    // Converting angle (0=up, -90=left, 90=right) to standard radians
    // We need to adjust the angle for the canvas coordinate system
    const adjustedAngle = 90 - angle; // This converts our system to standard angle (0=right, 90=up)
    const radians = (adjustedAngle * Math.PI) / 180;
    
    const speed = power / 2.75;
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
      gravity: 0.5,
      weapon: currentWeapon // Attach current weapon type to projectile
    };
  }

  // Update explosion animations
  function updateExplosions() {
    if (explosions.length === 0) return;
    
    // Loop through each explosion and update its state
    for (let i = explosions.length - 1; i >= 0; i--) {
      const explosion = explosions[i];
      
      if (explosion.growing) {
        // Grow the explosion
        explosion.currentRadius += 2;
        
        // Check if explosion reached max radius
        if (explosion.currentRadius >= explosion.maxRadius) {
          explosion.growing = false;
        }
      } else {
        // Shrink and fade out
        explosion.currentRadius -= 1;
        
        // Remove explosion when it's done
        if (explosion.currentRadius <= 0) {
          explosions.splice(i, 1);
        }
      }
    }
  }

  function updateProjectile() {
    if (!projectile) return;
    
    // Store previous position for collision detection
    const prevX = projectile.x;
    const prevY = projectile.y;
    
    // Update position
    projectile.vy += projectile.gravity;
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    
    // Check for terrain collision
    if (checkTerrainCollision(projectile.x, projectile.y)) {
      // Add explosion visual effect
      explosions.push({
        x: projectile.x,
        y: projectile.y,
        radius: projectile.weapon.radius,
        color: projectile.weapon.color,
        maxRadius: projectile.weapon.radius,
        currentRadius: 0,
        growing: true
      });
      
      // Explosion effect at collision point
      destroyTerrain(projectile.x, projectile.y, projectile.weapon.radius);
      
      // Check for tank damage from explosion
      checkTankDamage(projectile.x, projectile.y, projectile.weapon.radius, projectile.weapon.damage);
      
      projectile = null; // Remove projectile after collision
      return;
    }
    
    // Check for direct tank collision
    if (checkTankCollision(projectile.x, projectile.y)) {
      // Add explosion at tank hit point
      explosions.push({
        x: projectile.x,
        y: projectile.y,
        radius: projectile.weapon.radius,
        color: projectile.weapon.color,
        maxRadius: projectile.weapon.radius,
        currentRadius: 0,
        growing: true
      });
      
      // Still create terrain damage on tank hit
      destroyTerrain(projectile.x, projectile.y, projectile.weapon.radius);
      
      projectile = null; // Remove projectile after collision
      return;
    }
    
    // Check for out of bounds
    if (projectile.x < 0 || projectile.x > canvas.width || projectile.y > canvas.height) {
      projectile = null;
    }
  }
  
  // Check if projectile hit terrain
  function checkTerrainCollision(x, y) {
    // Check if projectile is within canvas boundaries
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      return false;
    }
    
    // Check if pixel at projectile position is not transparent (has terrain)
    const [r, g, b, a] = getPixel(x, y);
    return a > 0; // If alpha > 0, there's terrain here
  }

  // Check if projectile hit a tank
  function checkTankCollision(x, y) {
    // Check player's own tank (if not destroyed)
    if (!tank.destroyed) {
      const tankY = canvas.height - 20 - tank.height;
      if (x >= tank.x && x <= tank.x + tank.width &&
          y >= tankY && y <= tankY + tank.height) {
        // Direct hit on player's tank
        applyDamage(tank, projectile.weapon.damage);
        return true;
      }
    }
    
    // Check other player tanks
    for (const id in players) {
      const p = players[id];
      if (p && p.tank && !p.tank.destroyed) {
        const otherTankY = canvas.height - 20 - p.tank.height;
        if (x >= p.tank.x && x <= p.tank.x + p.tank.width &&
            y >= otherTankY && y <= otherTankY + p.tank.height) {
          // Direct hit on other player's tank
          if (!p.tank.health) p.tank.health = 100; // Initialize health if not set
          applyDamage(p.tank, projectile.weapon.damage);
          return true;
        }
      }
    }
    
    return false;
  }
  
  // Apply damage to a tank
  function applyDamage(targetTank, damage) {
    if (!targetTank.health) targetTank.health = 100; // Initialize health if not set
    
    targetTank.health = Math.max(0, targetTank.health - damage);
    
    // Mark tank as destroyed if health reaches zero
    if (targetTank.health === 0) {
      targetTank.destroyed = true;
      
      // Add a large explosion effect when a tank is destroyed
      explosions.push({
        x: targetTank.x + targetTank.width / 2,
        y: canvas.height - 20 - targetTank.height / 2,
        radius: 35,
        color: "red",
        maxRadius: 35,
        currentRadius: 0,
        growing: true
      });
    }
    
    // If this is our tank, inform the server about health change
    if (targetTank === tank && socket && playerId) {
      socket.emit('update-player', { 
        angle, 
        power, 
        tank 
      });
    }
  }
  
  // Check for splash damage to all tanks from explosion
  function checkTankDamage(explosionX, explosionY, radius, baseDamage) {
    // Helper function to calculate distance-based damage
    const calculateDamage = (distance, radius, baseDamage) => {
      if (distance > radius) return 0;
      // Less damage when further from explosion center
      return Math.floor(baseDamage * (1 - distance / radius));
    };
    
    // Check player's own tank (if not destroyed)
    if (!tank.destroyed) {
      const tankCenterX = tank.x + tank.width / 2;
      const tankCenterY = canvas.height - 20 - tank.height / 2;
      const distanceToPlayer = Math.sqrt(
        Math.pow(tankCenterX - explosionX, 2) + 
        Math.pow(tankCenterY - explosionY, 2)
      );
      
      const damageToPlayer = calculateDamage(distanceToPlayer, radius, baseDamage);
      if (damageToPlayer > 0) {
        applyDamage(tank, damageToPlayer);
      }
    }
    
    // Check other player tanks
    for (const id in players) {
      const p = players[id];
      if (p && p.tank && !p.tank.destroyed) {
        const otherTankCenterX = p.tank.x + p.tank.width / 2;
        const otherTankCenterY = canvas.height - 20 - p.tank.height / 2;
        const distanceToOther = Math.sqrt(
          Math.pow(otherTankCenterX - explosionX, 2) + 
          Math.pow(otherTankCenterY - explosionY, 2)
        );
        
        const damageToOther = calculateDamage(distanceToOther, radius, baseDamage);
        if (damageToOther > 0) {
          if (!p.tank.health) p.tank.health = 100; // Initialize health if not set
          applyDamage(p.tank, damageToOther);
        }
      }
    }
  }

  function drawTank(t, angle, color = 'gray') {
    // Don't render destroyed tanks
    if (t.destroyed) {
      return;
    }
    
    // const tankY = canvas.height - 20 - t.height;
    const tankY = getTerrainYAt(t.x + t.width / 2) - t.height;
    // Draw tank body
    ctx.fillStyle = t.color || color;
    ctx.fillRect(t.x, tankY, t.width, t.height);
    
    // Draw turret
    ctx.beginPath();
    const turretLength = 20;
    
    // Converting angle (0=up, -90=left, 90=right) to standard radians
    const adjustedAngle = 90 - angle; // This converts our system to standard angle (0=right, 90=up)
    const turretAngle = (adjustedAngle * Math.PI) / 180;
    
    const turretX = t.x + t.width / 2;
    const turretY = tankY;
    ctx.moveTo(turretX, turretY);
    ctx.lineTo(turretX + Math.cos(turretAngle) * turretLength, turretY - Math.sin(turretAngle) * turretLength);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw health bar if health property exists
    if (t.health !== undefined) {
      const healthBarWidth = t.width;
      const healthBarHeight = 5;
      const healthPercentage = t.health / 100;
      
      // Health bar background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(t.x, tankY - healthBarHeight - 2, healthBarWidth, healthBarHeight);
      
      // Health bar fill
      const healthColor = healthPercentage > 0.5 ? 'green' : 
                         healthPercentage > 0.25 ? 'orange' : 'red';
      ctx.fillStyle = healthColor;
      ctx.fillRect(t.x, tankY - healthBarHeight - 2, healthBarWidth * healthPercentage, healthBarHeight);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'lightblue';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw terrain from the image data
    ctx.putImageData(terrainData, 0, 0);

    drawTank(tank, angle);
    for (const id in players) {
      const p = players[id];
      if (p && p.tank) {
        drawTank(p.tank, p.angle || 45);
      }
    }

    if (projectile) {
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = projectile.weapon.color;
      ctx.fill();
    }
    
    // Draw active explosions
    for (const explosion of explosions) {
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.currentRadius, 0, Math.PI * 2);
      // Create gradient for explosion
      const gradient = ctx.createRadialGradient(
        explosion.x, explosion.y, explosion.currentRadius * 0.3, 
        explosion.x, explosion.y, explosion.currentRadius
      );
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
      gradient.addColorStop(0.5, explosion.color);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fill();
    }
    
    // Draw the current weapon info
    ctx.fillStyle = "black";
    ctx.font = "14px Arial";
    ctx.fillText(`Weapon: ${currentWeapon.name}`, 10, 20);
    
    // Show game status if player tank is destroyed
    if (tank.destroyed) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, canvas.height/2 - 30, canvas.width, 60);
      ctx.fillStyle = "white";
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("YOUR TANK WAS DESTROYED!", canvas.width/2, canvas.height/2);
      ctx.font = "16px Arial";
      ctx.fillText("Watch the other players battle or refresh to restart", canvas.width/2, canvas.height/2 + 25);
      ctx.textAlign = "left";
    }
  }

  function loop() {
    updateTankGravity;
    updateProjectile();
    updateExplosions();
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
        snapTankToTerrain(tank); // Snap your tank to the terrain here
      }
      
      // Get other players
      players = { ...existingPlayers };
      delete players[playerId];
      
      // Ensure y position is correct for all tanks
      if (canvas) {
        for (const pid in players) {
          if (players[pid].tank) {
            snapTankToTerrain(players[pid].tank);
          }
        }
      }
    });

    socket.on('player-joined', ({ id, data }) => {
      // Use the tank data sent from the server
      players[id] = data;
      // Make sure y position is set correctly
      if (players[id].tank && canvas) {
        snapTankToTerrain(players[id].tank); // Snap new tank to terrain

        // players[id].tank.y = canvas.height - 20 - players[id].tank.height;
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
    
    // Initialize terrain
    initTerrain();
    
    // Set up socket first to get tank position from server
    setupSocket();
    
    // Start the game loop
    draw();
    loop();
  });
</script>

<div class="controls" class:disabled={tank.destroyed}>
  <div class="angle-control">
    <label>
      Angle: <input type="range" min="-90" max="90" bind:value={angle} disabled={tank.destroyed} /> {angle}°
    </label>
  </div>
  <label>
    Power: <input type="range" min="10" max="100" bind:value={power} disabled={tank.destroyed} /> {power}
  </label>
  <button on:click={fire} disabled={tank.destroyed}>Fire</button>
  
  <div class="weapon-selector">
    <label>Weapon:</label>
    <select bind:value={currentWeapon} disabled={tank.destroyed}>
      <option value={weaponTypes.standard}>Standard Shell</option>
      <option value={weaponTypes.large}>Large Shell</option>
      <option value={weaponTypes.small}>Small Shell</option>
      <option value={weaponTypes.hyper}>HyperTech Shell</option>
      <option value={weaponTypes.nova}>Nova Shell</option>
    </select>
  </div>
</div>

<canvas bind:this={canvas} class="border mt-4" style="border: 1px solid black"></canvas>

<style>
  .controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  
  .disabled {
    opacity: 0.5;
    pointer-events: none;
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
  
  .weapon-selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
