// Events are POSTed to the Vite dev server on the same HTTPS origin.
// No separate server, no port 8080, no cert negotiation, no mixed content.
console.log('[socket] transport: fetch → /api/event');

export function sendEvent(type, payload = {}) {
  const event = { type, ts: Date.now(), ...payload };
  fetch('/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
    .then(r => {
      if (!r.ok) console.warn(`[socket] POST /api/event failed: HTTP ${r.status}`);
    })
    .catch(err => console.warn('[socket] fetch error:', err.message));
}
