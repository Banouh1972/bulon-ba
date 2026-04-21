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

function removeClient(ws) {
  for (const [roomId, clients] of rooms.entries()) {
    const leaving = clients.find(client => client.ws === ws);
    if (!leaving) continue;

    const remaining = clients.filter(client => client.ws !== ws);

    if (remaining.length === 0) {
      rooms.delete(roomId);
    } else {
      rooms.set(roomId, remaining);
      remaining.forEach(client => {
        send(client.ws, {
          type: 'peer-left',
          userId: leaving.userId,
          userName: leaving.userName
        });
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
          hasOtherPeer: clients.length > 1
        });

        clients.forEach(client => {
          if (client.ws !== ws) {
            send(client.ws, {
              type: 'peer-joined',
              userId: userId ?? null,
              userName: userName ?? 'Participant'
            });
          }
        });

        return;
      }

      if (type === 'chat-message') {
        if (!room) return;

        const clients = getRoom(room);
        clients.forEach(client => {
          if (client.ws !== ws) {
            send(client.ws, {
              type: 'chat-message',
              room,
              userId: userId ?? null,
              userName: userName ?? 'Participant',
              message: data.message ?? ''
            });
          }
        });

        return;
      }

      if (['offer', 'answer', 'ice-candidate'].includes(type)) {
        if (!room) return;

        const clients = getRoom(room);
        clients.forEach(client => {
          if (client.ws !== ws) {
            send(client.ws, data);
          }
        });

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
