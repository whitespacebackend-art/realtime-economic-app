const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const API_BASE = 'https://lionfish-app-rmoow.ondigitalocean.app/api/calendar-event-refinitiv/';

// Proxy REST API
app.get('/api/calendar-event-refinitiv/', async (req, res) => {
  try {
    const response = await axios.get(API_BASE, { params: req.query, timeout: 5000 });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'API Proxy Error: ' + error.message });
  }
});

// WebSocket for realtime updates (mock for now)
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('ping', () => socket.emit('pong'));

  // Mock update (replace with real logic when site revives)
  setInterval(() => {
    const mockUpdate = {
      event: 'update',
      data: {
        unique_reference: '2025-9-USHNS=ECI',
        actual: Math.random() * 100 + 50,
        updated_at: new Date().toISOString(),
      },
    };
    socket.emit('message', mockUpdate);
  }, 10000); // Every 10s
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));