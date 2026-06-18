require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http      = require('http');
const path      = require('path');
const fs        = require('fs');
const Anthropic  = require('@anthropic-ai/sdk');

const PORT      = 8080;
const LOG_FILE  = path.join(__dirname, 'session-log.json');

// Internal push listener in Vite receives ACD triggers from us
const VITE_PUSH = { hostname: '127.0.0.1', port: 5174, path: '/push' };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Card names from canvas.js BRANCHES — used as context for the Anthropic prompt
const BRANCH_CARDS = {
  Upskill:  ['Cost', 'Identity Risk', 'Obsolescence Risk'],
  Pivot:    ['Income Gap', 'Network Loss', 'Transition Time'],
  Automate: ['Technical Debt', 'Role Ambiguity', 'Adoption Risk'],
};

// ── Session state (single global session — PoC has one user at a time) ─────────
function freshSession() {
  return {
    // Accumulated dwell per card: dwell[branch][cardIndex] in ms
    dwell:     { Upskill: [0, 0, 0], Pivot: [0, 0, 0], Automate: [0, 0, 0] },
    // Whether the user dug past the surface layer on ANY card in this branch
    digDeeper: { Upskill: false, Pivot: false, Automate: false },
    // ACD already fired for this branch this session (max 1 per branch)
    acdFired:  { Upskill: false, Pivot: false, Automate: false },
    totalAcds: 0,  // session cap: 3
  };
}

let session = freshSession();

// ── Helpers ───────────────────────────────────────────────────────────────────
function appendLog(record) {
  const line = JSON.stringify({ ...record, serverTs: new Date().toISOString() }) + '\n';
  fs.appendFile(LOG_FILE, line, () => {});
}

function pushToFrontend(data) {
  const body = JSON.stringify(data);
  const req  = http.request(
    { ...VITE_PUSH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    },
    res => res.resume(),
  );
  req.on('error', err => console.warn('[astra] push to Vite failed:', err.message));
  req.write(body);
  req.end();
}

// ── ACD trigger ───────────────────────────────────────────────────────────────
async function maybeFireAcd(branch) {
  const s = session;

  if (s.acdFired[branch])  { console.log(`[astra] ACD skip: already fired for ${branch}`); return; }
  if (s.totalAcds >= 3)    { console.log('[astra] ACD skip: session cap (3) reached'); return; }
  if (s.digDeeper[branch]) { console.log(`[astra] ACD skip: user dug deeper on ${branch}`); return; }

  const totalDwell = s.dwell[branch].reduce((a, b) => a + b, 0);
  if (totalDwell >= 2500) {
    console.log(`[astra] ACD skip: ${branch} dwell ${totalDwell}ms ≥ 2500ms threshold`);
    return;
  }

  // Conditions met — identify the most-skipped card (lowest dwell)
  const dwells      = s.dwell[branch];
  const skippedIdx  = dwells.indexOf(Math.min(...dwells));
  const cards       = BRANCH_CARDS[branch] || ['Card 1', 'Card 2', 'Card 3'];
  const skippedCard = cards[skippedIdx];

  s.acdFired[branch] = true;
  s.totalAcds++;

  console.log(`[astra] ACD firing → ${branch} › "${skippedCard}" (total dwell: ${totalDwell}ms)`);

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 60,
      system:     'You are a decision coach in a VR environment. Write ONE short, non-judgmental question under 20 words that surfaces a trade-off the user skipped. Be curious, not corrective. Never say "you should".',
      messages:   [{
        role:    'user',
        content: `The user committed to "${branch}" without considering the trade-off: "${skippedCard}". Ask them one gentle, curious question about it.`,
      }],
    });

    const question = response.content[0].text.trim().replace(/^["']|["']$/g, '');
    console.log(`[astra] ACD question: "${question}"`);

    const payload = { type: 'acd_trigger', question, branch, skippedCard, totalDwell, ts: Date.now() };
    appendLog(payload);
    pushToFrontend(payload);

  } catch (err) {
    console.error('[astra] Anthropic error:', err.message);
    // Fallback so the loop still completes on API failure
    const fallback = {
      type: 'acd_trigger',
      question: `What does "${skippedCard}" mean for your ${branch} path?`,
      branch, skippedCard, totalDwell, ts: Date.now(),
    };
    appendLog({ ...fallback, fallback: true });
    pushToFrontend(fallback);
  }
}

// ── Event handler ─────────────────────────────────────────────────────────────
async function handleEvent(event) {
  const { type, branch, card, dwellMs, layer } = event;

  if (type === 'session_start') {
    session = freshSession();
    console.log('[astra] session reset');
    return;
  }

  // Accumulate per-card dwell from gaze_exit events
  if (type === 'gaze_exit' && branch && typeof card === 'number' && typeof dwellMs === 'number') {
    if (session.dwell[branch] && card >= 0 && card < 3) {
      session.dwell[branch][card] += dwellMs;
      console.log(`[astra] dwell ${branch}[${card}] → ${session.dwell[branch][card]}ms`);
    }
    return;
  }

  // Track if user dug past the surface layer on any card in this branch
  if (type === 'card_layer_viewed' && branch && layer && layer !== 'surface') {
    session.digDeeper[branch] = true;
    console.log(`[astra] dig_deeper marked for ${branch} (layer: ${layer})`);
    return;
  }

  // Commit received — check ACD conditions
  if (type === 'commit' && branch) {
    console.log(`[astra] commit: ${branch} | dwell: [${session.dwell[branch].join(', ')}] | digDeeper: ${session.digDeeper[branch]}`);
    await maybeFireAcd(branch);
    return;
  }
}

// ── HTTP server (loopback only — not exposed to Quest browser) ────────────────
const server = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const event = JSON.parse(body);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
      await handleEvent(event);
    } catch {
      res.statusCode = 400;
      res.end('{"error":"bad json"}');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[astra] ACD server → http://127.0.0.1:${PORT}`);
  console.log(`[astra] Anthropic key: ${process.env.ANTHROPIC_API_KEY ? 'loaded ✓' : 'MISSING — set ANTHROPIC_API_KEY in server/.env'}`);
  console.log(`[astra] session log  → ${LOG_FILE}`);
});
