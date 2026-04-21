const http = require('http');
const WebSocket = require('ws');

const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("OK - Server running");
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log("Client connected");
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
