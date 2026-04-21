const WebSocket = require('ws');
const http = require('http');

const port = process.env.PORT || 3001;

// ✅ Serveur HTTP OBLIGATOIRE pour Railway
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log("Client connecté");

    ws.on('message', (message) => {
        console.log("Message:", message.toString());
    });

    ws.on('close', () => {
        console.log("Client déconnecté");
    });
});

// ⚠️ très important : 0.0.0.0
server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});
