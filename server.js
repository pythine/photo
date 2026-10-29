// Server: file statis + signaling WebSocket untuk WebRTC (maksimal 2 orang per room)
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });

// rooms: kode -> array of ws (maks 2)
const rooms = new Map();

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function peerOf(ws) {
  const room = rooms.get(ws.room) || [];
  return room.find((c) => c !== ws && c.readyState === 1);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (!code) return;
      const room = (rooms.get(code) || []).filter((c) => c.readyState === 1);
      if (room.length >= 2) {
        send(ws, { type: 'full' });
        return;
      }
      const existing = room[0];
      ws.room = code;
      ws.name = String(msg.name || 'Pasangan').slice(0, 20);
      ws.role = existing && existing.role === 'left' ? 'right' : 'left';
      room.push(ws);
      rooms.set(code, room);

      send(ws, {
        type: 'joined',
        role: ws.role,
        room: code,
        peerName: existing ? existing.name : null,
      });
      if (existing) {
        // yang sudah ada di room bertugas membuat offer WebRTC
        send(existing, { type: 'peer-joined', peerName: ws.name });
      }
      return;
    }

    // pesan lain (offer, answer, candidate, bg, shoot) diteruskan ke pasangan
    if (!ws.room) return;
    const other = peerOf(ws);
    if (other) send(other, msg);
  });

  ws.on('close', () => {
    if (!ws.room) return;
    const room = (rooms.get(ws.room) || []).filter((c) => c !== ws);
    if (room.length === 0) rooms.delete(ws.room);
    else {
      rooms.set(ws.room, room);
      room.forEach((c) => send(c, { type: 'peer-left' }));
    }
  });
});

// Heartbeat agar koneksi tidak diputus oleh proxy/hosting
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => {
  console.log(`Photobooth LDR berjalan di http://localhost:${PORT}`);
});
