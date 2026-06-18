import { defineConfig }    from 'vite';
import basicSsl             from '@vitejs/plugin-basic-ssl';
import fs                   from 'node:fs';
import http                 from 'node:http';
import path                 from 'node:path';
import { fileURLToPath }    from 'node:url';
import { WebSocketServer }  from 'ws';

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE       = path.resolve(__dirname, '../server/session-log.json');
const ACD_SERVER_URL = { hostname: '127.0.0.1', port: 8080 };  // server.js
const PUSH_PORT      = 5174;                                     // internal: server→vite

// Fire-and-forget: forward event body to server.js ACD engine
function forwardToAcdServer(rawBody) {
  const req = http.request(
    { ...ACD_SERVER_URL, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) },
    },
    res => res.resume(),
  );
  req.on('error', () => {}); // ACD server may not be running — silently skip
  req.write(rawBody);
  req.end();
}

export default defineConfig({
  plugins: [
    basicSsl(),
    {
      name: 'astra-event-api',
      configureServer(server) {

        // ── WebSocket server (noServer — shares Vite's HTTPS port) ──────────────
        // Clients connect to wss://<host>/api/ws, same cert Quest already trusts.
        const wsClients = new Set();
        const astraWss  = new WebSocketServer({ noServer: true });

        astraWss.on('connection', ws => {
          wsClients.add(ws);
          console.log('[astra] WS client connected');
          ws.on('close', () => wsClients.delete(ws));
          ws.on('error', err => console.warn('[astra] WS client error:', err.message));
        });

        // Route /api/ws upgrades to our WSS; ignore everything else so Vite HMR works
        server.httpServer.on('upgrade', (req, socket, head) => {
          if (req.url === '/api/ws') {
            astraWss.handleUpgrade(req, socket, head, ws => {
              astraWss.emit('connection', ws, req);
            });
          }
        });

        // ── Internal plain-HTTP push listener (loopback only) ─────────────────
        // server.js POSTs ACD triggers here; we broadcast them to WS clients.
        const internalPush = http.createServer((req, res) => {
          if (req.url !== '/push' || req.method !== 'POST') {
            res.statusCode = 404; res.end(); return;
          }
          let body = '';
          req.on('data', c => { body += c; });
          req.on('end', () => {
            wsClients.forEach(ws => { try { ws.send(body); } catch (_) {} });
            res.end('ok');
          });
        });
        internalPush.listen(PUSH_PORT, '127.0.0.1', () => {
          console.log(`[astra] internal push listener → 127.0.0.1:${PUSH_PORT}`);
        });

        // ── Event API: log + forward to ACD server ─────────────────────────────
        server.middlewares.use('/api/event', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const event = JSON.parse(body);
              const line  = JSON.stringify({ ...event, serverTs: new Date().toISOString() }) + '\n';
              fs.appendFile(LOG_FILE, line, err => {
                if (err) console.error('[astra] log write error:', err.message);
              });
              forwardToAcdServer(body);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end('{"ok":true}');
            } catch {
              res.statusCode = 400;
              res.end('{"error":"bad json"}');
            }
          });
        });
      },
    },
  ],
  server: { https: true, host: true },
});
