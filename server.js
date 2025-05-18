import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const players = {};

// Canvas properties (matching client)
const CANVAS_WIDTH = 800;
const TANK_WIDTH = 40;
const BUFFER_SIZE = 50;

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

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Find the best spawn position
  const spawnPosition = findBestSpawnPosition();
  
  players[socket.id] = { 
    angle: 45, // Default to pointing right and up (in our new system where 0=up, -90=left, 90=right)
    power: 50,
    tank: {
      x: spawnPosition,
      y: 100, // Y position will be adjusted on the client based on ground level
      width: TANK_WIDTH,
      height: 20,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16) // Random color
    }
  };

  socket.emit('init', { id: socket.id, players });

  socket.broadcast.emit('player-joined', { id: socket.id, data: players[socket.id] });

  socket.on('update-player', (data) => {
    players[socket.id] = data;
    socket.broadcast.emit('player-updated', { id: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    socket.broadcast.emit('player-left', { id: socket.id });
  });
});

httpServer.listen(3001, () => {
  console.log('Socket.IO server running at http://localhost:3001');
});
