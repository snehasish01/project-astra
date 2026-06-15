const WS_URL = 'ws://localhost:8080';

let ws = null;
const queue = [];

function connect() {
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    setTimeout(connect, 3000);
    return;
  }

  ws.addEventListener('open', () => {
    console.log('[socket] connected');
    queue.splice(0).forEach(e => ws.send(JSON.stringify(e)));
  });

  ws.addEventListener('message', ({ data }) => {
    try { console.log('[socket] rx:', JSON.parse(data)); } catch { /* ignore */ }
  });

  ws.addEventListener('close', () => {
    ws = null;
    setTimeout(connect, 3000);
  });

  ws.addEventListener('error', () => { /* close fires next */ });
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
