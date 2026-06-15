const { WebSocketServer } = require('ws');

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  console.log('[astra] client connected');

  ws.on('message', (data) => {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      console.warn('[astra] bad message:', data.toString());
      return;
    }
    console.log('[astra] event:', event);
    // Prompt logic comes later
  });

  ws.on('close', () => console.log('[astra] client disconnected'));
  ws.on('error', (err) => console.error('[astra] ws error:', err.message));
});

console.log(`[astra] WS server listening on ws://localhost:${PORT}`);
