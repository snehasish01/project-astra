// ── Outbound: events via fetch (same HTTPS origin, no cert issues) ────────────
export function sendEvent(type, payload = {}) {
  const event = { type, ts: Date.now(), ...payload };
  fetch('/api/event', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(event),
  })
    .then(r => { if (!r.ok) console.warn(`[socket] POST /api/event HTTP ${r.status}`); })
    .catch(err => console.warn('[socket] fetch error:', err.message));
}

// ── Inbound: ACD triggers via WebSocket (wss:// same Vite HTTPS port) ─────────
const _listeners = [];
export function onServerMessage(fn) { _listeners.push(fn); }

const WS_URL = `wss://${location.host}/api/ws`;
console.log(`[socket] connecting → ${WS_URL}`);

function connectWs() {
  try {
    const ws = new WebSocket(WS_URL);
    ws.addEventListener('open',    ()  => console.log('[socket] WS open'));
    ws.addEventListener('message', e  => {
      try {
        const msg = JSON.parse(e.data);
        _listeners.forEach(fn => fn(msg));
      } catch (_) {}
    });
    ws.addEventListener('close',   ()  => {
      console.warn('[socket] WS closed — reconnecting in 3 s');
      setTimeout(connectWs, 3000);
    });
    ws.addEventListener('error',   err => console.warn('[socket] WS error:', err));
  } catch (err) {
    console.warn('[socket] WS init failed:', err.message);
  }
}

connectWs();
