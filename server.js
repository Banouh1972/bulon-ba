const WebSocket = require('ws');
const http = require('http');

const port = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log("Client connecté");
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});
