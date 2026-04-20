const WebSocket = require('ws');
const http = require('http');

const port = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('OK');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log("Client connecté");

    ws.on('message', (msg) => {
        console.log("Message reçu:", msg.toString());
    });
});

server.listen(port, '0.0.0.0', () => {
    console.log("Server running on port", port);
});
