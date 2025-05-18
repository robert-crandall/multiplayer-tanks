import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const players = {};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  players[socket.id] = { angle: 45, power: 50 };

  socket.emit('init', { id: socket.id, players });

  socket.broadcast.emit('player-joined', { id: socket.id });

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
