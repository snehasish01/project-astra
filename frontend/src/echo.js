import * as THREE from 'three';

// Canvas 1024 × 620  →  mesh 0.94 × 0.569 m  (ratio 1.653)
const CW = 1024, CH = 620;
const MW = 0.94, MH = 0.569;
const Z  = -0.9;
const Y  = 1.55;

const BRANCH_COLOR = { Upskill: '#42a5f5', Pivot: '#ffa726', Automate: '#66bb6a' };

const CONSEQUENCES = {
  Upskill: {
    statement: `You're betting that continuous learning will outpace disruption.`,
    tradingAway: [
      { from: 'Pivot',    cost: 'A clean break — freedom from your current identity' },
      { from: 'Automate', cost: 'Tools as leverage: machines multiplying your output' },
    ],
  },
  Pivot: {
    statement: `You're choosing disruption on your own terms, before it chooses you.`,
    tradingAway: [
      { from: 'Upskill',  cost: 'Deep expertise that compounds over decades' },
      { from: 'Automate', cost: 'Staying relevant without abandoning your field' },
    ],
  },
  Automate: {
    statement: `You're betting on force multiplication — working smarter, not elsewhere.`,
    tradingAway: [
      { from: 'Upskill', cost: 'The safety net of hard, human-irreplaceable expertise' },
      { from: 'Pivot',   cost: 'The freedom a total reset would eventually bring' },
    ],
  },
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y); line = word; y += lineH;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, cx, y);
}

function buildEchoTex(branch) {
  const data  = CONSEQUENCES[branch];
  const color = BRANCH_COLOR[branch];

  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const ctx = cv.getContext('2d');

  // Background
  rr(ctx, 0, 0, CW, CH, 0);
  ctx.fillStyle = '#050c1a'; ctx.fill();

  // Gold border
  rr(ctx, 5, 5, CW - 10, CH - 10, 20);
  ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 4; ctx.stroke();

  // Header
  ctx.fillStyle = '#ffd54f';
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('DECISION ECHO', CW / 2, 22);

  // Chosen branch
  ctx.fillStyle = color;
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`You chose: ${branch}`, CW / 2, 72);

  // Consequence statement
  ctx.fillStyle = '#c8d8f0';
  ctx.font = 'italic 40px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  wrapText(ctx, data.statement, CW / 2, 168, CW - 80, 56);

  // Separator
  ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60, 280); ctx.lineTo(CW - 60, 280); ctx.stroke();

  // "Trading away" label
  ctx.fillStyle = '#ef9a9a';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText("Are you sure? Here's what you're trading away:", CW / 2, 298);

  // Trade-away items
  data.tradingAway.forEach(({ from, cost }, i) => {
    const y0 = 360 + i * 100;
    rr(ctx, 50, y0, CW - 100, 82, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();

    const fromColor = BRANCH_COLOR[from];
    ctx.fillStyle = fromColor;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(from, 70, y0 + 10);

    ctx.fillStyle = '#90aac8';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText(cost, 70, y0 + 46);
  });

  return new THREE.CanvasTexture(cv);
}

function buildBtnTex(label, bg) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  rr(ctx, 6, 6, 500, 116, 16);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 64);
  return new THREE.CanvasTexture(cv);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createDecisionEcho(scene) {
  // Card
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(MW, MH),
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  card.position.set(0, Y, Z);
  card.visible = false;
  scene.add(card);

  // Buttons
  const confirmBtn = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.09),
    new THREE.MeshBasicMaterial({ map: buildBtnTex('Confirm ✓', '#1b5e20'), transparent: true }),
  );
  confirmBtn.position.set(-0.22, Y - MH / 2 - 0.06, Z);
  confirmBtn.visible = false;
  confirmBtn.userData = { type: 'echo_confirm' };
  scene.add(confirmBtn);

  const reconsiderBtn = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.09),
    new THREE.MeshBasicMaterial({ map: buildBtnTex('Reconsider', '#4a1500'), transparent: true }),
  );
  reconsiderBtn.position.set(0.22, Y - MH / 2 - 0.06, Z);
  reconsiderBtn.visible = false;
  reconsiderBtn.userData = { type: 'echo_reconsider' };
  scene.add(reconsiderBtn);

  let currentBranch = null;

  function show(branch) {
    currentBranch = branch;
    card.material.map = buildEchoTex(branch);
    card.material.needsUpdate = true;
    card.visible = true;
    confirmBtn.visible = true;
    reconsiderBtn.visible = true;
  }

  function hide() {
    card.visible = false;
    confirmBtn.visible = false;
    reconsiderBtn.visible = false;
    currentBranch = null;
  }

  function getBranch() { return currentBranch; }

  return { interactables: [confirmBtn, reconsiderBtn], show, hide, getBranch };
}
