import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { networkInterfaces } from 'os';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Serve static files from the 'static' directory
app.use(express.static('static'));

// Add a simple route to show the local IP addresses
app.get('/', (req, res) => {
  const interfaces = networkInterfaces();
  let localIPs = [];
  
  // Get all local network interfaces
  Object.keys(interfaces).forEach(iface => {
    interfaces[iface].forEach(details => {
      // Only get IPv4 addresses that aren't internal
      if (details.family === 'IPv4' && !details.internal) {
        localIPs.push(details.address);
      }
    });
  });
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tanks Game Server</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>Tanks Game Server Running</h1>
      <p>Server is listening on all network interfaces.</p>
      <h2>Access this game on your LAN using one of these URLs:</h2>
      <ul>
        ${localIPs.map(ip => `<li><a href="http://${ip}:3001/game" target="_blank">http://${ip}:3001/game</a></li>`).join('')}
      </ul>
      <h2>Make sure your client connects to one of these addresses</h2>
      <p>In your client code, check that the socket.io connection points to the correct IP, not localhost.</p>
      <p>Current players connected: <strong>${Object.keys(players).length}</strong></p>
    </body>
    </html>
  `;
  
  res.send(html);
});

// Forward /game to the SvelteKit app
app.get('/game', (req, res) => {
  res.redirect('/');
});

// Game state
const players = {};
let projectiles = [];
let explosions = [];
let terrainState = null; // Will be initialized when the first player sends terrain data

// Canvas properties (matching client)
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400; // Adding canvas height
const TANK_WIDTH = 40;
const BUFFER_SIZE = 50;

// Game physics constants
const GRAVITY = 0.5;

function findBestSpawnPosition() {
  // Split the canvas into left and right sides
  const midpoint = CANVAS_WIDTH / 2;
  let leftSideTanks = 0;
  let rightSideTanks = 0;
  const occupiedPositions = [];
  
  // Count how many tanks are on each side and track their positions
  for (const id in players) {
    const tankX = players[id].tank.x;
    occupiedPositions.push({
      start: tankX - BUFFER_SIZE,
      end: tankX + TANK_WIDTH + BUFFER_SIZE
    });
    
    if (tankX < midpoint) {
      leftSideTanks++;
    } else {
      rightSideTanks++;
    }
  }
  
  // Determine which side to spawn on (the side with fewer tanks)
  const spawnOnLeft = leftSideTanks <= rightSideTanks;
  
  // Define the range where we can spawn
  let minX = 20; // Some padding from left edge
  let maxX = spawnOnLeft ? midpoint - TANK_WIDTH - BUFFER_SIZE : CANVAS_WIDTH - TANK_WIDTH - 20;
  let startX = spawnOnLeft ? minX : midpoint;
  let endX = spawnOnLeft ? midpoint - TANK_WIDTH : maxX;
  
  // Find valid positions that don't overlap with the buffer zones
  const validPositions = [];
  for (let x = startX; x <= endX; x += 10) { // Check every 10 pixels
    let isValid = true;
    
    // Check if this position would violate any tank's buffer zone
    for (const pos of occupiedPositions) {
      if (x < pos.end && x + TANK_WIDTH + BUFFER_SIZE > pos.start) {
        isValid = false;
        break;
      }
    }
    
    if (isValid) {
      validPositions.push(x);
    }
  }
  
  // If we found valid positions, pick one randomly
  if (validPositions.length > 0) {
    return validPositions[Math.floor(Math.random() * validPositions.length)];
  }
  
  // If no valid position found, fallback to a random position on the chosen side
  // (This could still cause buffer overlap in a very crowded game)
  return Math.floor(Math.random() * (endX - startX)) + startX;
}

// Server-side physics update (for projectiles)
function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    
    // Update position
    projectile.vy += GRAVITY;
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    
    // Check for out of bounds
    if (projectile.x < 0 || projectile.x > CANVAS_WIDTH || projectile.y > CANVAS_HEIGHT) {
      projectiles.splice(i, 1);
      continue;
    }
    
    // Collision checks handled by clients for now
  }
}

// Update explosion animations
function updateExplosions() {
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

// Game loop
setInterval(() => {
  if (projectiles.length > 0 || explosions.length > 0) {
    updateProjectiles();
    updateExplosions();
    
    // Broadcast game state updates to all clients
    io.emit('game-state-update', {
      projectiles,
      explosions
    });
  }
}, 1000 / 60); // 60 FPS

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Find the best spawn position
  const spawnPosition = findBestSpawnPosition();
  
  players[socket.id] = { 
    angle: 45, // Default to pointing right and up (in our new system where 0=up, -90=left, 90=right)
    power: 50,
    tank: {
      x: spawnPosition,
      y: 0, // Y position will be adjusted on the client based on ground level
      width: TANK_WIDTH,
      height: 20,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16), // Random color
      health: 100,
      destroyed: false
    }
  };

  // Send initial game state to new player
  socket.emit('init', { 
    id: socket.id, 
    players,
    projectiles,
    explosions,
    terrainState
  });

  // Let other players know about the new player
  socket.broadcast.emit('player-joined', { id: socket.id, data: players[socket.id] });

  // Handle player updates (angle, power, position)
  socket.on('update-player', (data) => {
    if (players[socket.id]) {
      players[socket.id] = data;
      socket.broadcast.emit('player-updated', { id: socket.id, data });
    }
  });
  
  // Handle player firing
  socket.on('player-fired', (projectileData) => {
    if (players[socket.id] && !players[socket.id].tank.destroyed) {
      // Add player ID to track who fired this projectile
      projectileData.playerId = socket.id;
      
      // Add to projectiles array
      projectiles.push(projectileData);
      
      // Broadcast to all clients
      io.emit('projectile-added', projectileData);
    }
  });
  
  // Handle terrain updates
  socket.on('terrain-updated', (terrainData) => {
    terrainState = terrainData;
    // Broadcast to all other clients
    socket.broadcast.emit('terrain-updated', terrainData);
  });
  
  // Handle terrain damage
  socket.on('terrain-damaged', (damageData) => {
    // Broadcast to all other clients
    socket.broadcast.emit('terrain-damaged', damageData);
  });
  
  // Handle explosions
  socket.on('explosion-created', (explosionData) => {
    explosions.push(explosionData);
    // Broadcast to all other clients
    socket.broadcast.emit('explosion-created', explosionData);
  });
  
  // Handle tank damage
  socket.on('tank-damaged', ({ targetId, damage }) => {
    if (players[targetId]) {
      // Apply damage
      const targetTank = players[targetId].tank;
      if (!targetTank.health) targetTank.health = 100;
      
      targetTank.health = Math.max(0, targetTank.health - damage);
      
      // Check if tank is destroyed
      if (targetTank.health === 0) {
        targetTank.destroyed = true;
      }
      
      // Broadcast tank health update to all clients
      io.emit('tank-health-update', { 
        id: targetId, 
        health: targetTank.health,
        destroyed: targetTank.destroyed 
      });
    }
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    socket.broadcast.emit('player-left', { id: socket.id });
  });
});

httpServer.listen(3001, '0.0.0.0', () => {
  console.log('Socket.IO server running at http://0.0.0.0:3001');
  console.log('Access this server on your LAN at:');
  console.log(`http://<your-local-ip>:3001`);
});
