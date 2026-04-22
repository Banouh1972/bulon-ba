const http = require('http');
const { WebSocketServer } = require('ws');

const port = Number(process.env.PORT || 8080);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK - Server running');
});

const wss = new WebSocketServer({ noServer: true });

// roomId => [{ ws, userId, userName }]
const rooms = new Map();

function send(ws, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, []);
  }
  return rooms.get(roomId);
}

function getParticipants(roomId) {
  const clients = rooms.get(roomId) || [];
  return clients.map(client => ({
    userId: client.userId ?? null,
    userName: client.userName ?? 'Participant'
  }));
}

function broadcast(roomId, payload, exceptWs = null) {
  const clients = rooms.get(roomId) || [];
  clients.forEach(client => {
    if (client.ws !== exceptWs) {
      send(client.ws, payload);
    }
  });
}

function removeClient(ws) {
  for (const [roomId, clients] of rooms.entries()) {
    const leaving = clients.find(client => client.ws === ws);
    if (!leaving) continue;

    const remaining = clients.filter(client => client.ws !== ws);

    if (remaining.length === 0) {
      rooms.delete(roomId);
    } else {
      rooms.set(roomId, remaining);

      broadcast(roomId, {
        type: 'peer-left',
        userId: leaving.userId,
        userName: leaving.userName
      });

      broadcast(roomId, {
        type: 'participants-update',
        participants: getParticipants(roomId)
      });
    }

    break;
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type, room, userId, userName } = data;

      if (!type) return;

      if (type === 'join-room') {
        if (!room) return;

        const clients = getRoom(room);
        const exists = clients.some(client => client.ws === ws);

        if (!exists) {
          clients.push({
            ws,
            userId: userId ?? null,
            userName: userName ?? 'Participant'
          });
        }

        send(ws, {
          type: 'room-info',
          hasOtherPeer: clients.length > 1,
          participants: getParticipants(room)
        });

        broadcast(room, {
          type: 'peer-joined',
          userId: userId ?? null,
          userName: userName ?? 'Participant'
        }, ws);

        broadcast(room, {
          type: 'participants-update',
          participants: getParticipants(room)
        });

        return;
      }

      if (type === 'chat-message') {
        if (!room) return;

        broadcast(room, {
          type: 'chat-message',
          room,
          userId: userId ?? null,
          userName: userName ?? 'Participant',
          message: data.message ?? '',
          time: data.time ?? null
        }, ws);

        return;
      }

      if (type === 'reaction') {
        if (!room) return;

        broadcast(room, {
          type: 'reaction',
          room,
          userId: userId ?? null,
          userName: userName ?? 'Participant',
          reaction: data.reaction ?? ''
        }, ws);

        return;
      }

      if (['offer', 'answer', 'ice-candidate'].includes(type)) {
        if (!room) return;

        broadcast(room, data, ws);
        return;
      }
    } catch (err) {
      console.error('Invalid message:', err);
    }
  });

  ws.on('close', () => {
    removeClient(ws);
    console.log('Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    removeClient(ws);
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
