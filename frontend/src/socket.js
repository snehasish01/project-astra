// Try secure first; fall back to plain WS if the cert isn't trusted on the device.
const CANDIDATE_URLS = [
  'wss://192.168.6.154:8080',
  'ws://192.168.6.154:8080',
];
const CONNECT_TIMEOUT_MS = 5000;
const RECONNECT_DELAY_MS = 4000;

let ws    = null;
const queue = [];

// ── Try a single URL, resolving with the open socket or rejecting on failure ──
function tryUrl(url) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    };

    const timer = setTimeout(
      () => settle(reject, new Error(`timeout connecting to ${url}`)),
      CONNECT_TIMEOUT_MS,
    );

    let sock;
    try {
      sock = new WebSocket(url);
    } catch (err) {
      // Thrown synchronously when the browser blocks the URL (e.g. mixed-content)
      clearTimeout(timer);
      reject(err);
      return;
    }

    sock.addEventListener('open',  ()    => settle(resolve, sock));
    sock.addEventListener('error', (evt) => settle(reject,  new Error(`error on ${url}`)));
  });
}

// ── Connect: try each URL in order, reconnect on disconnect ──────────────────
async function connect() {
  for (const url of CANDIDATE_URLS) {
    console.log(`[socket] trying ${url} …`);
    try {
      const sock = await tryUrl(url);
      ws = sock;
      console.log(`[socket] ✓ connected to ${url}`);

      // Flush queued events
      queue.splice(0).forEach(e => ws.send(JSON.stringify(e)));

      ws.addEventListener('message', ({ data }) => {
        try { console.log('[socket] rx:', JSON.parse(data)); } catch { /* ignore */ }
      });

      ws.addEventListener('close', () => {
        console.warn(`[socket] disconnected from ${url}, reconnecting in ${RECONNECT_DELAY_MS}ms …`);
        ws = null;
        setTimeout(connect, RECONNECT_DELAY_MS);
      });

      return; // success — stop trying further URLs
    } catch (err) {
      console.warn(`[socket] ✗ ${err.message}`);
    }
  }

  console.error(`[socket] all URLs failed — retrying in ${RECONNECT_DELAY_MS}ms`);
  setTimeout(connect, RECONNECT_DELAY_MS);
}

export function sendEvent(type, payload = {}) {
  const event = { type, ts: Date.now(), ...payload };
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  } else {
    queue.push(event);
  }
}

connect();
