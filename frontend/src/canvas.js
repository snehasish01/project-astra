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
      { title: 'Income Gap',       sub: 'Salary reset on entry' },
      { title: 'Network Loss',     sub: 'Starting over socially' },
      { title: 'Transition Time',  sub: 'How long until stable?' },
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

const Z      = -1.5;
const HDR_Y  = 1.70;
const CARD_Y = [1.34, 0.97, 0.60];
const CMT_Y  = 0.35;

const HDR_W  = 0.70,  HDR_H  = 0.164;  // 1024 × 240
const CARD_W = 0.70,  CARD_H = 0.328;  // 1024 × 480
const CMT_W  = 0.38,  CMT_H  = 0.095;  // 512  × 128

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

    ctx.fillStyle = color;
    ctx.fillRect(6, 6, w - 12, 16);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, w / 2, 105);

    ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 160); ctx.lineTo(w - 60, 160); ctx.stroke();

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

function makePlane(w, h, texFn) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texFn(), transparent: true }),
  );
}

// ─── public API ──────────────────────────────────────────────────────────────

export function createDecisionCanvas(scene, { onBranchOpen = () => {}, onCommit = () => {} } = {}) {
  const interactables   = [];
  const panels          = [];
  const allCardMeshes   = [];       // flat list of every card mesh (for gaze tracking)
  const branchOpenTime  = {};       // branch name → performance.now() when first opened
  const cardsByBranch   = {};       // branch name → [mesh, mesh, mesh]

  for (const b of BRANCHES) {
    // Header — starts hidden (opacity 0, not visible) until fade-in
    const header = makePlane(HDR_W, HDR_H, () => makeHeaderTex(b.name, b.color));
    header.position.set(b.x, HDR_Y, Z);
    header.material.opacity = 0;
    header.visible = false;
    header.userData = { type: 'panel_header', branch: b.name };
    scene.add(header);
    interactables.push(header);

    // Cards — hidden until branch is expanded
    const cards = b.cards.map((c, i) => {
      const m = makePlane(CARD_W, CARD_H, () => makeCardTex(c.title, c.sub, b.color));
      m.position.set(b.x, CARD_Y[i], Z);
      m.visible = false;
      m.userData = { type: 'card', branch: b.name, cardIndex: i, cardTitle: c.title };
      scene.add(m);
      interactables.push(m);
      allCardMeshes.push(m);
      return m;
    });
    cardsByBranch[b.name] = cards;

    // Commit button
    const commit = makePlane(CMT_W, CMT_H, makeCommitTex);
    commit.position.set(b.x, CMT_Y, Z);
    commit.visible = false;
    commit.userData = { type: 'commit', branch: b.name };
    scene.add(commit);
    interactables.push(commit);

    panels.push({ name: b.name, header, cards, commit, expanded: false });
  }

  // ── expand / collapse ───────────────────────────────────────────────────────

  function setExpanded(branchName) {
    for (const p of panels) {
      const shouldOpen = p.name === branchName ? !p.expanded : false;
      const wasExpanded = p.expanded;
      p.expanded = shouldOpen;
      p.cards.forEach(c => { c.visible = shouldOpen; });
      p.commit.visible = shouldOpen;
      p.header.material.color.setHex(shouldOpen ? 0xccffcc : 0xffffff);

      if (shouldOpen && !wasExpanded) {
        branchOpenTime[branchName] = performance.now();
        onBranchOpen(branchName);
      }
    }
  }

  // ── select handler (called by controller) ───────────────────────────────────

  function onSelect(object) {
    const { type, branch } = object.userData;
    if (type === 'panel_header') {
      setExpanded(branch);
    } else if (type === 'commit') {
      const openedAt = branchOpenTime[branch] ?? performance.now();
      onCommit(branch, performance.now() - openedAt);
    }
  }

  // ── fade-in helpers (called from main.js) ───────────────────────────────────

  function beginFadeIn() {
    for (const p of panels) {
      p.header.visible         = true;
      p.header.material.opacity = 0;
    }
  }

  function setHeaderOpacity(v) {
    for (const p of panels) {
      p.header.material.opacity = v;
    }
  }

  function getCardMeshes(branchName) {
    return cardsByBranch[branchName] ?? [];
  }

  return { interactables, onSelect, allCardMeshes, getCardMeshes, beginFadeIn, setHeaderOpacity };
}
