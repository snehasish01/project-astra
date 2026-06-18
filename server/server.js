require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http      = require('http');
const path      = require('path');
const fs        = require('fs');
const Anthropic  = require('@anthropic-ai/sdk');

const PORT      = 8080;
const LOG_FILE  = path.join(__dirname, 'session-log.json');
const VITE_PUSH = { hostname: '127.0.0.1', port: 5174, path: '/push' };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Static reference data (mirrors canvas.js) ─────────────────────────────────
const BRANCHES = ['Upskill', 'Pivot', 'Automate'];
const BRANCH_CARDS = {
  Upskill:  ['Cost', 'Identity Risk', 'Obsolescence Risk'],
  Pivot:    ['Income Gap', 'Network Loss', 'Transition Time'],
  Automate: ['Technical Debt', 'Role Ambiguity', 'Adoption Risk'],
};
const LAYER_RANK = { surface: 0, evidence: 1, personal: 2 };

// One fallback question per pattern label — used when LLM times out or errors
const FALLBACK_QUESTIONS = {
  confirmation: 'What trade-off from the other paths are you most willing to leave unexplored?',
  overload:     'Which one card, if you reread it slowly right now, might shift something?',
  premature:    'What evidence would make you feel ready enough to commit?',
};

// ── Session trace ─────────────────────────────────────────────────────────────

function freshSession() {
  const branches = {};
  for (const b of BRANCHES) {
    branches[b] = {
      totalDwellMs:  0,
      cardsViewed:   BRANCH_CARDS[b].map(name => ({ name, dwellMs: 0, maxLayer: 'surface', hovered: false })),
      digDeeperCount: 0,
      timeSpentMs:   0,
      firstVisitAt:  null,
    };
  }
  return {
    sessionId:       `s-${Date.now()}`,
    startedAt:       Date.now(),
    branchOrder:     [],
    branches,
    comparisonOpened: false,
    commitIntent:    null,   // { branch, timestamp, timeFromStartMs }
    acdFired:        { Upskill: false, Pivot: false, Automate: false },
    totalAcds:       0,
    postAcd: {
      active: false, startedAt: null,
      dwell: {}, digDeeper: {}, timer: null,
    },
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
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
    res => res.resume(),
  );
  req.on('error', err => console.warn('[astra] push failed:', err.message));
  req.write(body); req.end();
}

// ── Layer 2: Pattern classifier ───────────────────────────────────────────────

function classifyPattern(s) {
  const { commitIntent } = s;
  if (!commitIntent) return { label: 'deliberate', confidence: 0.5, signals: {} };

  const committingBranch = commitIntent.branch;
  const totalTimeMs      = commitIntent.timeFromStartMs;

  let totalDwellMs = 0, totalCards = 0, evidenceLayerCount = 0, hasAnyDigDeeper = false;
  const branchDwell = {};

  for (const [b, data] of Object.entries(s.branches)) {
    const bd = data.cardsViewed.reduce((sum, c) => sum + c.dwellMs, 0);
    branchDwell[b]  = bd;
    totalDwellMs   += bd;
    totalCards     += data.cardsViewed.length;
    for (const c of data.cardsViewed) {
      if (c.maxLayer !== 'surface') evidenceLayerCount++;
    }
    if (data.digDeeperCount > 0) hasAnyDigDeeper = true;
  }

  const committingDwell   = branchDwell[committingBranch] || 0;
  const dwellRatio        = totalDwellMs > 0 ? committingDwell / totalDwellMs : 0;
  const visitedFirst      = s.branchOrder[0] === committingBranch;
  const committingDigCount = s.branches[committingBranch]?.digDeeperCount || 0;
  const otherMaxDig       = BRANCHES
    .filter(b => b !== committingBranch)
    .reduce((max, b) => Math.max(max, s.branches[b]?.digDeeperCount || 0), 0);
  const avgDwellPerCard   = totalCards > 0 ? Math.round(totalDwellMs / totalCards) : 0;

  const signals = {
    committingBranch, totalTimeMs, totalDwellMs,
    dwellRatio:            +dwellRatio.toFixed(2),
    visitedFirst,          committingDigCount,
    otherBranchesMaxDig:   otherMaxDig,
    evidenceLayerCount,    hasAnyDigDeeper,
    avgDwellPerCard,
  };

  // Confirmation: user focused mostly on committing branch, went there first, dug deeper there than elsewhere
  if (dwellRatio > 0.6 && visitedFirst && committingDigCount > 0 && committingDigCount > otherMaxDig) {
    return { label: 'confirmation', confidence: +Math.min(0.98, dwellRatio * 1.5).toFixed(2), signals };
  }

  // Overload: long session but shallow everywhere, never clicked deeper
  if (totalTimeMs > 90000 && avgDwellPerCard < 2000 && !hasAnyDigDeeper) {
    return { label: 'overload', confidence: 0.85, signals };
  }

  // Premature: committed very quickly, almost no evidence-layer reading
  if (totalTimeMs < 30000 && evidenceLayerCount < 4) {
    return { label: 'premature', confidence: 0.90, signals };
  }

  // Deliberate: explored broadly, went deep somewhere — no interrupt needed
  return { label: 'deliberate', confidence: 0.80, signals };
}

// ── Layer 3: Calibrated LLM interrupt ─────────────────────────────────────────

function buildTraceSnapshot(s) {
  const branches = {};
  for (const [b, data] of Object.entries(s.branches)) {
    branches[b] = {
      totalDwellMs:   data.cardsViewed.reduce((sum, c) => sum + c.dwellMs, 0),
      cardsViewed:    data.cardsViewed,
      digDeeperCount: data.digDeeperCount,
      firstVisitAt:   data.firstVisitAt,
    };
  }
  return {
    sessionId:        s.sessionId,
    startedAt:        s.startedAt,
    branchOrder:      s.branchOrder,
    branches,
    comparisonOpened: s.comparisonOpened,
    commitIntent:     s.commitIntent,
  };
}

function findLeastExploredBranch(s, excludeBranch) {
  return BRANCHES
    .filter(b => b !== excludeBranch)
    .reduce((min, b) => {
      const d = s.branches[b].cardsViewed.reduce((sum, c) => sum + c.dwellMs, 0);
      const m = s.branches[min].cardsViewed.reduce((sum, c) => sum + c.dwellMs, 0);
      return d < m ? b : min;
    }, BRANCHES.find(b => b !== excludeBranch));
}

async function fireAcd(branch, classification) {
  const s = session;
  if (s.acdFired[branch] || s.totalAcds >= 3) return;

  s.acdFired[branch] = true;
  s.totalAcds++;

  // Context: least-dwelled card in committing branch (most likely to have been skipped)
  const branchData      = s.branches[branch];
  const leastDwelled    = branchData.cardsViewed.reduce((m, c) => c.dwellMs < m.dwellMs ? c : m, branchData.cardsViewed[0]);
  const defaultRefCard  = leastDwelled.name;
  const defaultRefBranch = classification.label === 'confirmation'
    ? findLeastExploredBranch(s, branch) : branch;

  console.log(`[astra] ACD firing → ${branch} | pattern: ${classification.label} | skipped card: "${defaultRefCard}"`);

  // Start 30-second post-ACD behavioral tracking
  startPostAcdWindow(s);

  let question = FALLBACK_QUESTIONS[classification.label];
  let referencedCard   = defaultRefCard;
  let referencedBranch = defaultRefBranch;

  try {
    const trace = buildTraceSnapshot(s);

    const llmPromise = anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 150,
      system: `You are a decision coach observing a user in a VR career-decision environment. You will receive a behavioral trace and a detected cognitive pattern label. Generate ONE short question (under 25 words) that surfaces the specific trade-off this user appears to be avoiding, named by card title. The question must reflect the detected pattern: for 'confirmation' surface a trade-off from a branch they barely explored; for 'overload' name the single most important card they skimmed; for 'premature' ask what evidence would change their mind. Never say 'you should'. Be curious, not corrective. Respond with valid JSON only: {"question":"...","referencedCard":"...","referencedBranch":"..."}`,
      messages: [{
        role:    'user',
        content: JSON.stringify({ trace, classification }),
      }],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('LLM timeout (3 s)')), 3000),
    );

    const response = await Promise.race([llmPromise, timeoutPromise]);
    const raw = response.content[0].text.trim();

    try {
      // Strip markdown code fences if the model wraps its JSON response
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const parsed       = JSON.parse(jsonStr);
      question           = (parsed.question || '').trim().replace(/^["']|["']$/g, '') || question;
      referencedCard     = parsed.referencedCard   || defaultRefCard;
      referencedBranch   = parsed.referencedBranch || defaultRefBranch;
    } catch {
      // LLM returned plain text instead of JSON — use it as the question
      question = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
                    .replace(/^["']|["']$/g, '') || question;
    }

    console.log(`[astra] ACD question: "${question}"`);

  } catch (err) {
    console.warn(`[astra] LLM error (${err.message}), using pattern fallback`);
  }

  const payload = {
    type: 'acd_trigger',
    pattern: classification.label,
    question,
    referencedCard,
    referencedBranch,
    branch,
    ts: Date.now(),
  };
  appendLog(payload);
  pushToFrontend(payload);
}

// ── Post-ACD tracking window (30 s) ──────────────────────────────────────────

function startPostAcdWindow(s) {
  if (s.postAcd.timer) clearTimeout(s.postAcd.timer);

  const dwell    = {};
  const digDeeper = {};
  for (const b of BRANCHES) { dwell[b] = [0, 0, 0]; digDeeper[b] = false; }

  s.postAcd = {
    active: true,
    startedAt: Date.now(),
    dwell, digDeeper,
    timer: setTimeout(() => {
      if (session !== s) return;   // session was reset
      s.postAcd.active = false;
      s.postAcd.timer  = null;
      appendLog({
        event:      'post_acd_summary',
        sessionId:  s.sessionId,
        durationMs: 30000,
        dwell:      s.postAcd.dwell,
        digDeeper:  s.postAcd.digDeeper,
      });
      console.log('[astra] post-ACD 30 s window closed');
    }, 30000),
  };
  console.log('[astra] post-ACD 30 s tracking window started');
}

// ── Event handler ─────────────────────────────────────────────────────────────

async function handleEvent(event) {
  const { type, branch, card, dwellMs, layer } = event;

  // ── Session reset
  if (type === 'session_start') {
    if (session.postAcd.timer) clearTimeout(session.postAcd.timer);
    session = freshSession();
    console.log('[astra] session reset');
    return;
  }

  // ── Branch first-open: record visit order and timestamp
  if (type === 'branch_open' && branch && BRANCHES.includes(branch)) {
    if (!session.branchOrder.includes(branch)) session.branchOrder.push(branch);
    if (!session.branches[branch].firstVisitAt)  session.branches[branch].firstVisitAt = Date.now();
    return;
  }

  // ── Gaze dwell: accumulate per-card totals (main trace + post-ACD window)
  if (type === 'gaze_exit' && branch && typeof card === 'number' && typeof dwellMs === 'number') {
    const b = session.branches[branch];
    if (b && card >= 0 && card < 3) {
      b.cardsViewed[card].dwellMs += dwellMs;
      b.totalDwellMs += dwellMs;
    }
    if (session.postAcd.active && session.postAcd.dwell[branch]) {
      session.postAcd.dwell[branch][card] = (session.postAcd.dwell[branch][card] || 0) + dwellMs;
    }
    return;
  }

  // ── Card hover: mark in trace for richer context
  if (type === 'card_hover' && branch && typeof card === 'number') {
    const b = session.branches[branch];
    if (b && card >= 0 && card < 3) b.cardsViewed[card].hovered = true;
    return;
  }

  // ── Layer explored: update maxLayer + digDeeper count
  if (type === 'card_layer_viewed' && branch && layer) {
    const b = session.branches[branch];
    if (b && typeof card === 'number' && card >= 0 && card < 3) {
      const c = b.cardsViewed[card];
      if (LAYER_RANK[layer] > LAYER_RANK[c.maxLayer]) c.maxLayer = layer;
      if (layer !== 'surface') {
        b.digDeeperCount++;
        if (session.postAcd.active) session.postAcd.digDeeper[branch] = true;
      }
    }
    return;
  }

  // ── Comparison opened
  if (type === 'comparison_opened') {
    session.comparisonOpened = true;
    return;
  }

  // ── commit_intent: classify pattern and fire ACD if warranted
  if (type === 'commit_intent' && branch) {
    const timeFromStart = Date.now() - session.startedAt;
    session.commitIntent = { branch, timestamp: Date.now(), timeFromStartMs: timeFromStart };

    const classification = classifyPattern(session);
    console.log(`[astra] commit_intent: ${branch} | pattern: ${classification.label} (${Math.round(classification.confidence * 100)}%) | signals: ${JSON.stringify(classification.signals)}`);
    appendLog({ event: 'pattern_classified', sessionId: session.sessionId, ...classification, branch, triggeredBy: 'commit_intent' });

    if (classification.label !== 'deliberate' && !session.acdFired[branch] && session.totalAcds < 3) {
      await fireAcd(branch, classification);
    }
    return;
  }

  // ── commit (click): fallback classify if commit_intent didn't already fire ACD
  if (type === 'commit' && branch) {
    if (!session.acdFired[branch]) {
      if (!session.commitIntent) {
        session.commitIntent = { branch, timestamp: Date.now(), timeFromStartMs: Date.now() - session.startedAt };
      }
      const classification = classifyPattern(session);
      console.log(`[astra] commit (fallback classify): ${branch} | pattern: ${classification.label}`);
      appendLog({ event: 'pattern_classified', sessionId: session.sessionId, ...classification, branch, triggeredBy: 'commit' });
      if (classification.label !== 'deliberate' && session.totalAcds < 3) {
        await fireAcd(branch, classification);
      }
    }
    return;
  }

  // ── Post-ACD lifecycle events: just log them
  if (type === 'acd_lock_started' || type === 'acd_lock_released' || type === 'post_acd_action') {
    appendLog({ ...event, sessionId: session.sessionId });
    console.log(`[astra] ${type}:`, JSON.stringify(event));
    return;
  }
}

// ── HTTP server (loopback only — receives forwarded events from Vite) ──────────
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
