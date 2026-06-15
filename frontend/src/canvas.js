import * as THREE from 'three';

const BRANCHES = [
  {
    name: 'Upskill',
    color: '#42a5f5',
    x: -0.85,
    cards: [
      { title: 'Cost',               sub: 'Time + money invested' },
      { title: 'Identity Risk',      sub: 'Am I too old?' },
      { title: 'Obsolescence Risk',  sub: 'What if I upskill into the wrong thing?' },
    ],
  },
  {
    name: 'Pivot',
    color: '#ffa726',
    x: 0,
    cards: [
      { title: 'Income Gap',        sub: 'Salary reset on entry' },
      { title: 'Network Loss',      sub: 'Starting over socially' },
      { title: 'Transition Time',   sub: 'How long until stable?' },
    ],
  },
  {
    name: 'Automate',
    color: '#66bb6a',
    x: 0.85,
    cards: [
      { title: 'Technical Debt',  sub: 'Maintaining your own tools' },
      { title: 'Role Ambiguity',  sub: 'What do I do now?' },
      { title: 'Adoption Risk',   sub: 'Will my org accept this?' },
    ],
  },
];

// World-space layout (metres)
const Z      = -1.5;
const HDR_Y  = 1.70;  // header centre
const CARD_Y = [1.34, 0.97, 0.60];  // card centres
const CMT_Y  = 0.35;  // commit button centre

// Mesh sizes  (canvas aspect ratios are matched exactly below)
const HDR_W  = 0.70,  HDR_H  = 0.164;   // 1024 × 240  → 4.267
const CARD_W = 0.70,  CARD_H = 0.328;   // 1024 × 480  → 2.133
const CMT_W  = 0.38,  CMT_H  = 0.095;   // 512  × 128  → 4.0

// ─── texture helpers ─────────────────────────────────────────────────────────

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function canvasTex(w, h, draw) {
  return new THREE.CanvasTexture(makeCanvas(w, h, draw));
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y);
      line = word;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, y);
}

function makeHeaderTex(name, color) {
  return canvasTex(1024, 240, (ctx, w, h) => {
    roundedRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.fillStyle = '#0a1628'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 7;
    roundedRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 88px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, w / 2, h / 2);
  });
}

function makeCardTex(title, sub, color) {
  return canvasTex(1024, 480, (ctx, w, h) => {
    roundedRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.fillStyle = '#0a1628'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 6;
    roundedRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.stroke();

    // accent stripe
    ctx.fillStyle = color;
    ctx.fillRect(6, 6, w - 12, 16);

    // title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, w / 2, 105);

    // divider
    ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 160); ctx.lineTo(w - 60, 160);
    ctx.stroke();

    // subtitle (with word-wrap)
    ctx.fillStyle = '#90caf9';
    ctx.font = '54px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    wrapText(ctx, sub, w / 2, 185, w - 100, 74);
  });
}

function makeCommitTex() {
  return canvasTex(512, 128, (ctx, w, h) => {
    roundedRect(ctx, 6, 6, w - 12, h - 12, 16);
    ctx.fillStyle = '#b71c1c'; ctx.fill();

    // inner highlight ring
    ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 3;
    roundedRect(ctx, 10, 10, w - 20, h - 20, 12);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 62px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COMMIT', w / 2, h / 2);
  });
}

// ─── panel factory ───────────────────────────────────────────────────────────

function makePlane(w, h, texFn) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texFn(), transparent: true }),
  );
}

// ─── public API ──────────────────────────────────────────────────────────────

export function createDecisionCanvas(scene) {
  const interactables = [];
  const panels = [];

  for (const b of BRANCHES) {
    // header — always visible, acts as the expand/collapse toggle
    const header = makePlane(HDR_W, HDR_H, () => makeHeaderTex(b.name, b.color));
    header.position.set(b.x, HDR_Y, Z);
    header.userData = { type: 'panel_header', branch: b.name };
    scene.add(header);
    interactables.push(header);

    // trade-off cards — visible only when expanded
    const cards = b.cards.map((c, i) => {
      const m = makePlane(CARD_W, CARD_H, () => makeCardTex(c.title, c.sub, b.color));
      m.position.set(b.x, CARD_Y[i], Z);
      m.visible = false;
      m.userData = { type: 'card', branch: b.name, cardIndex: i };
      scene.add(m);
      interactables.push(m);
      return m;
    });

    // commit button — visible only when expanded
    const commit = makePlane(CMT_W, CMT_H, makeCommitTex);
    commit.position.set(b.x, CMT_Y, Z);
    commit.visible = false;
    commit.userData = { type: 'commit', branch: b.name };
    scene.add(commit);
    interactables.push(commit);

    panels.push({ name: b.name, header, cards, commit, expanded: false });
  }

  function setExpanded(branchName) {
    for (const p of panels) {
      const open = p.name === branchName ? !p.expanded : false;
      p.expanded = open;
      p.cards.forEach(c => { c.visible = open; });
      p.commit.visible = open;
      // tint header border slightly when open (multiply color property)
      p.header.material.color.setHex(open ? 0xccffcc : 0xffffff);
    }
  }

  function onSelect(object) {
    const { type, branch } = object.userData;
    if (type === 'panel_header') {
      setExpanded(branch);
    } else if (type === 'commit') {
      console.log('[astra] commit:', branch);
      // WebSocket event will go here
    }
    // cards are read-only in the current build
  }

  return { interactables, onSelect };
}
