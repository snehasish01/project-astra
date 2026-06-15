const https            = require('https');
const fs               = require('fs');
const path             = require('path');
const { WebSocketServer } = require('ws');
const selfsigned       = require('selfsigned');

const PORT     = 8080;
const LOG_FILE = path.join(__dirname, 'session-log.json');

// ── File logger ───────────────────────────────────────────────────────────────
function appendLog(record) {
  const line = JSON.stringify({ ...record, ts: new Date().toISOString() }) + '\n';
  fs.appendFile(LOG_FILE, line, err => {
    if (err) console.error('[astra] log write error:', err.message);
  });
}

// ── TLS (self-signed, generated in memory) ────────────────────────────────────
const pems = selfsigned.generate(
  [{ name: 'commonName', value: 'astra-local' }],
  { days: 365, keySize: 2048 },
);

const httpsServer = https.createServer({ key: pems.private, cert: pems.cert });

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpsServer });

// Attach CORS headers to every upgrade response
wss.on('headers', (headers) => {
  headers.push('Access-Control-Allow-Origin: *');
  headers.push('Access-Control-Allow-Headers: *');
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[astra] client connected from ${clientIp}`);
  appendLog({ type: 'client_connected', ip: clientIp });

  ws.on('message', (data) => {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      console.warn('[astra] bad message:', data.toString());
      return;
    }
    console.log('[astra] event:', event);
    appendLog(event);          // write raw event (already has its own ts field)
    // Prompt logic comes later
  });

  ws.on('close', () => console.log('[astra] client disconnected'));
  ws.on('error', (err) => console.error('[astra] ws error:', err.message));
});

httpsServer.listen(PORT, () => {
  console.log(`[astra] WSS server listening on wss://192.168.6.154:${PORT}`);
  console.log(`[astra] session log → ${LOG_FILE}`);
});
