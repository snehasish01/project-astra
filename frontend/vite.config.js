import { defineConfig }  from 'vite';
import basicSsl          from '@vitejs/plugin-basic-ssl';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE  = path.resolve(__dirname, '../server/session-log.json');

export default defineConfig({
  plugins: [
    basicSsl(),
    {
      name: 'astra-event-api',
      configureServer(server) {
        server.middlewares.use('/api/event', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const event = JSON.parse(body);
              const line  = JSON.stringify({ ...event, serverTs: new Date().toISOString() }) + '\n';
              fs.appendFile(LOG_FILE, line, err => {
                if (err) console.error('[astra] log write error:', err.message);
              });
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
  server: {
    https: true,
    host: true,
  },
});
