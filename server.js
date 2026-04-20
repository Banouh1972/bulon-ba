const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3001 });

const rooms = new Map();

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

wss.on('connection', (ws) => {

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        const { type, room } = data;

        if (!room) return;

        if (!rooms.has(room)) {
            rooms.set(room, []);
        }

        const clients = rooms.get(room);

        switch (type) {

            case 'join-room':
                if (clients.length >= 2) {
                    send(ws, { type: 'room-full' });
                    return;
                }

                clients.push(ws);
                send(ws, { type: 'room-info', hasOtherPeer: clients.length > 1 });

                if (clients.length === 2) {
                    clients.forEach(c => send(c, { type: 'peer-joined' }));
                }
                break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
            case 'chat-message':
                clients.forEach(c => {
                    if (c !== ws) send(c, data);
                });
                break;

            case 'leave-room':
                rooms.set(room, clients.filter(c => c !== ws));
                break;
        }
    });

    ws.on('close', () => {
        for (const [room, clients] of rooms.entries()) {
            rooms.set(room, clients.filter(c => c !== ws));
        }
    });
});

console.log("WebSocket server running on port 3001");
