const http = require('http');
const { WebSocketServer } = require('ws');

const port = Number(process.env.PORT || 8080);
const MAX_PARTICIPANTS = 4;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK - Server running');
});

const wss = new WebSocketServer({ noServer: true });

// roomId => {
//   hostUserId: "1",
//   clients: [{ ws, userId, userName, isHost, handRaised, micEnabled, camEnabled }]
// }
const rooms = new Map();

function send(ws, payload) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function getRoomState(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      hostUserId: null,
      clients: []
    });
  }
  return rooms.get(roomId);
}

function getParticipants(roomId) {
  const room = rooms.get(roomId);
  const clients = room?.clients || [];

  return clients.map(client => ({
    userId: String(client.userId ?? ''),
    userName: client.userName ?? 'Participant',
    isHost: !!client.isHost,
    handRaised: !!client.handRaised,
    micEnabled: client.micEnabled !== false,
    camEnabled: client.camEnabled !== false
  }));
}

function broadcast(roomId, payload, exceptWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.clients.forEach(client => {
    if (client.ws !== exceptWs) {
      send(client.ws, payload);
    }
  });
}

function findClient(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room.clients.find(c => String(c.userId) === String(userId)) || null;
}

function removeClientByWs(ws) {
  for (const [roomId, room] of rooms.entries()) {
    const leaving = room.clients.find(client => client.ws === ws);
    if (!leaving) continue;

    room.clients = room.clients.filter(client => client.ws !== ws);

    if (room.clients.length === 0) {
      rooms.delete(roomId);
      break;
    }

    if (String(room.hostUserId) === String(leaving.userId)) {
      room.hostUserId = String(room.clients[0].userId);
      room.clients[0].isHost = true;
      broadcast(roomId, {
        type: 'host-changed',
        hostUserId: room.hostUserId
      });
    }

    broadcast(roomId, {
      type: 'peer-left',
      userId: String(leaving.userId ?? ''),
      userName: leaving.userName ?? 'Participant'
    });

    broadcast(roomId, {
      type: 'participants-update',
      participants: getParticipants(roomId)
    });

    break;
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type, room, userId, userName, targetUserId } = data;

      if (!type) return;

      if (type === 'join-room') {
        if (!room) return;

        const roomState = getRoomState(room);
        const currentUserId = String(userId ?? '');

        let client = roomState.clients.find(c => String(c.userId) === currentUserId);

        if (!client) {
          if (roomState.clients.length >= MAX_PARTICIPANTS) {
            send(ws, {
              type: 'room-full',
              maxParticipants: MAX_PARTICIPANTS
            });
            return;
          }

          const isHost = roomState.clients.length === 0;
          if (isHost) {
            roomState.hostUserId = currentUserId;
          }

          client = {
            ws,
            userId: currentUserId,
            userName: userName ?? 'Participant',
            isHost,
            handRaised: false,
            micEnabled: true,
            camEnabled: true
          };

          roomState.clients.push(client);
        } else {
          client.ws = ws;
          client.userName = userName ?? client.userName;
        }

        send(ws, {
          type: 'room-info',
          participants: getParticipants(room),
          maxParticipants: MAX_PARTICIPANTS,
          hostUserId: roomState.hostUserId
        });

        broadcast(room, {
          type: 'peer-joined',
          userId: currentUserId,
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
          userId: String(userId ?? ''),
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
          userId: String(userId ?? ''),
          userName: userName ?? 'Participant',
          reaction: data.reaction ?? ''
        }, ws);

        return;
      }

      if (type === 'participant-state') {
        if (!room) return;

        const client = findClient(room, userId);
        if (!client) return;

        if (typeof data.handRaised === 'boolean') client.handRaised = data.handRaised;
        if (typeof data.micEnabled === 'boolean') client.micEnabled = data.micEnabled;
        if (typeof data.camEnabled === 'boolean') client.camEnabled = data.camEnabled;

        broadcast(room, {
          type: 'participants-update',
          participants: getParticipants(room)
        });

        return;
      }

      if (type === 'moderator-action') {
        if (!room || !targetUserId) return;

        const roomState = rooms.get(room);
        if (!roomState) return;

        const sender = findClient(room, userId);
        if (!sender || !sender.isHost) return;

        const target = findClient(room, targetUserId);
        if (!target) return;

        const action = data.action;

        if (action === 'mute-mic') {
          target.micEnabled = false;
          send(target.ws, { type: 'moderator-action', action: 'mute-mic' });
        }

        if (action === 'disable-cam') {
          target.camEnabled = false;
          send(target.ws, { type: 'moderator-action', action: 'disable-cam' });
        }

        if (action === 'lower-hand') {
          target.handRaised = false;
          send(target.ws, { type: 'moderator-action', action: 'lower-hand' });
        }

        if (action === 'remove-user') {
          send(target.ws, { type: 'moderator-action', action: 'remove-user' });
          try { target.ws.close(); } catch (e) {}
          roomState.clients = roomState.clients.filter(c => String(c.userId) !== String(targetUserId));
        }

        broadcast(room, {
          type: 'participants-update',
          participants: getParticipants(room)
        });

        return;
      }

      if (['offer', 'answer', 'ice-candidate'].includes(type)) {
        if (!room || !targetUserId) return;

        const roomState = rooms.get(room);
        if (!roomState) return;

        const target = roomState.clients.find(client => String(client.userId) === String(targetUserId));
        if (!target) return;

        send(target.ws, {
          ...data,
          fromUserId: String(userId ?? ''),
          fromUserName: userName ?? 'Participant'
        });

        return;
      }
    } catch (err) {
      console.error('Invalid message:', err);
    }
  });

  ws.on('close', () => {
    removeClientByWs(ws);
    console.log('Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    removeClientByWs(ws);
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
