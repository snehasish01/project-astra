const https            = require('https');
const { WebSocketServer } = require('ws');
const selfsigned       = require('selfsigned');

const PORT = 8080;

// Generate a self-signed cert on every start (no file I/O needed for a PoC)
const attrs = [{ name: 'commonName', value: 'astra-local' }];
const pems  = selfsigned.generate(attrs, { days: 365, keySize: 2048 });

const httpsServer = https.createServer({
  key:  pems.private,
  cert: pems.cert,
});

const wss = new WebSocketServer({ server: httpsServer });

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

httpsServer.listen(PORT, () => {
  console.log(`[astra] WSS server listening on wss://192.168.6.154:${PORT}`);
});
