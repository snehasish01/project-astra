import * as THREE from 'three';

// ── Branch data (all three layers per card) ──────────────────────────────────

export const BRANCHES = [
  {
    name: 'Upskill', color: '#42a5f5', x: -0.85,
    cards: [
      {
        title: 'Cost', sub: 'Time + money invested',
        evidence: 'Professionals spend avg $3,200/yr on upskilling;\n14–18 months to measurable ROI\n(LinkedIn Learning Report 2024)',
        personal: 'Think of the last skill you paid to learn.\nDid the return match the investment?',
      },
      {
        title: 'Identity Risk', sub: 'Am I too old?',
        evidence: '28% of successful career changers are over 45\nand report higher long-term satisfaction\n(HBR 2023)',
        personal: 'When did you last feel like a genuine beginner?\nHow did that feel — threatening or energising?',
      },
      {
        title: 'Obsolescence Risk', sub: 'What if I upskill into the wrong thing?',
        evidence: 'Technical skill half-life is now 2.5 years\n(World Economic Forum 2023)',
        personal: 'How do you decide what\'s worth learning\nvs. what\'s just hype?',
      },
    ],
  },
  {
    name: 'Pivot', color: '#ffa726', x: 0,
    cards: [
      {
        title: 'Income Gap', sub: 'Salary reset on entry',
        evidence: 'Mid-career pivoters take avg 6–18 months\nto match prior income\n(Indeed Hiring Report 2024)',
        personal: 'What\'s the minimum income you could live on\nfor 18 months? Do you have a runway plan?',
      },
      {
        title: 'Network Loss', sub: 'Starting over socially',
        evidence: '70% of jobs come through networks;\npivots reset 60%+ of relevant contacts\n(LinkedIn 2023)',
        personal: 'Name one person in your current network\nwho bridges where you are to where you want to go.',
      },
      {
        title: 'Transition Time', sub: 'How long until stable?',
        evidence: 'Career pivots average 11 months from decision\nto a stable new role\n(McKinsey Future of Work 2023)',
        personal: 'What would "stable" look like on the other side?\nCan you picture a specific day in that life?',
      },
    ],
  },
  {
    name: 'Automate', color: '#66bb6a', x: 0.85,
    cards: [
      {
        title: 'Technical Debt', sub: 'Maintaining your own tools',
        evidence: '52% of professionals who build custom AI workflows\nspend 4+ hrs/week in maintenance\n(Stack Overflow Developer Survey 2024)',
        personal: 'What\'s one task you do manually right now\nthat, if automated, would genuinely free you?',
      },
      {
        title: 'Role Ambiguity', sub: 'What do I do now?',
        evidence: 'Job postings citing AI-augmentation skills\ngrew 300% in 24 months\n(Burning Glass Labor Insights 2024)',
        personal: 'If your tools handled 40% of your current work,\nwhat would you do with that freed capacity?',
      },
      {
        title: 'Adoption Risk', sub: 'Will my org accept this?',
        evidence: '65% of orgs have no formal policy\nfor employee-led AI tool adoption\n(Gartner 2024)',
        personal: 'Who in your organisation would be your ally\nin bringing a new way of working?',
      },
    ],
  },
];

// ── Layout constants ──────────────────────────────────────────────────────────

const Z      = -1.5;
const HDR_Y  = 1.70;
const CARD_Y = [1.34, 0.97, 0.60];
const CMT_Y  = 0.35;
const CMP_Y  = 0.90;   // Compare button

const HDR_W  = 0.70,  HDR_H  = 0.164;
const CARD_W = 0.70,  CARD_H = 0.328;
const CMT_W  = 0.38,  CMT_H  = 0.095;
const CMP_W  = 0.38,  CMP_H  = 0.085;

// ── Texture helpers ───────────────────────────────────────────────────────────

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function wrapLines(ctx, text, cx, y, maxW, lineH) {
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, y); line = word; y += lineH;
      } else { line = test; }
    }
    if (line) { ctx.fillText(line, cx, y); y += lineH; }
  }
}

function makeHeaderTex(name, color) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 240;
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  rr(ctx, 6, 6, w - 12, h - 12, 20); ctx.fillStyle = '#0a1628'; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 7;
  rr(ctx, 6, 6, w - 12, h - 12, 20); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 88px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2, h / 2);
  return new THREE.CanvasTexture(cv);
}

// Redraw one card canvas in-place for the given layer
function drawCardLayer(ctx, w, h, card, color, layer) {
  ctx.clearRect(0, 0, w, h);

  const LAYER_META = [
    { label: null,       accentCol: color,     bgLabel: null,       textCol: '#90caf9' },
    { label: 'EVIDENCE', accentCol: '#ffd54f', bgLabel: '#2a2000',  textCol: '#fff9c4' },
    { label: 'REFLECT',  accentCol: '#ce93d8', bgLabel: '#1a0a2e',  textCol: '#e1bee7' },
  ];
  const meta = LAYER_META[layer];

  // Background
  rr(ctx, 6, 6, w - 12, h - 12, 20);
  ctx.fillStyle = meta.bgLabel ?? '#0a1628'; ctx.fill();

  // Border
  ctx.strokeStyle = meta.accentCol; ctx.lineWidth = 6;
  rr(ctx, 6, 6, w - 12, h - 12, 20); ctx.stroke();

  // Accent stripe at top
  ctx.fillStyle = meta.accentCol; ctx.fillRect(6, 6, w - 12, 16);

  // Layer badge
  if (meta.label) {
    ctx.fillStyle = meta.accentCol;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(meta.label, w - 20, 28);
  }

  ctx.textAlign = 'center';

  // Title (all layers)
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 68px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.title, w / 2, 102);

  // Divider
  ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60, 155); ctx.lineTo(w - 60, 155); ctx.stroke();

  // Body text
  ctx.fillStyle = meta.textCol;
  ctx.font = layer === 0 ? '52px system-ui, sans-serif'
    : (layer === 1 ? '44px system-ui, sans-serif' : 'italic 44px system-ui, sans-serif');
  ctx.textBaseline = 'top';
  const body = layer === 0 ? card.sub : layer === 1 ? card.evidence : card.personal;
  wrapLines(ctx, body, w / 2, 174, w - 90, layer === 0 ? 68 : 58);

  // Bottom hint
  const hint = layer < 2 ? 'Dig Deeper ›' : '‹ Back to surface';
  ctx.fillStyle = `${meta.accentCol}88`;
  ctx.font = '32px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(hint, w / 2, h - 14);
}

function makeCommitTex() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  rr(ctx, 6, 6, w - 12, h - 12, 16); ctx.fillStyle = '#b71c1c'; ctx.fill();
  ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 3;
  rr(ctx, 10, 10, w - 20, h - 20, 12); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 62px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('COMMIT', w / 2, h / 2);
  return new THREE.CanvasTexture(cv);
}

function makeCompareTex() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  rr(ctx, 5, 5, w - 10, h - 10, 14); ctx.fillStyle = '#0e2040'; ctx.fill();
  ctx.strokeStyle = '#4a90d9'; ctx.lineWidth = 3;
  rr(ctx, 8, 8, w - 16, h - 16, 11); ctx.stroke();
  ctx.fillStyle = '#90caf9'; ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Compare All ⟺', w / 2, h / 2);
  return new THREE.CanvasTexture(cv);
}

function plane(w, h, tex) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createDecisionCanvas(scene, {
  onBranchOpen  = () => {},
  onCommit      = () => {},
  onLayerViewed = () => {},
  onCompare     = () => {},
} = {}) {
  const interactables  = [];
  const panels         = [];
  const allCardMeshes  = [];
  const cardsByBranch  = {};
  const branchOpenTime = {};

  for (const b of BRANCHES) {
    // ── Header ──────────────────────────────────────────────────────────────
    const header = plane(HDR_W, HDR_H, makeHeaderTex(b.name, b.color));
    header.position.set(b.x, HDR_Y, Z);
    header.material.opacity = 0;
    header.visible = false;
    header.userData = { type: 'panel_header', branch: b.name };
    scene.add(header);
    interactables.push(header);

    // ── Cards (one canvas per card, redrawn on layer change) ─────────────
    const cards = b.cards.map((c, i) => {
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 480;
      const tex = new THREE.CanvasTexture(cv);
      drawCardLayer(cv.getContext('2d'), cv.width, cv.height, c, b.color, 0);

      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W, CARD_H),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      m.position.set(b.x, CARD_Y[i], Z);
      m.visible = false;
      m.userData = {
        type: 'card', branch: b.name, cardIndex: i, cardTitle: c.title,
        layer: 0, maxLayer: 0,
        cardData: c, branchColor: b.color,
        cvRef: cv, texRef: tex,
      };
      scene.add(m);
      interactables.push(m);
      allCardMeshes.push(m);
      return m;
    });
    cardsByBranch[b.name] = cards;

    // ── Commit button ────────────────────────────────────────────────────
    const commit = plane(CMT_W, CMT_H, makeCommitTex());
    commit.position.set(b.x, CMT_Y, Z);
    commit.visible = false;
    commit.userData = { type: 'commit', branch: b.name };
    scene.add(commit);
    interactables.push(commit);

    panels.push({ name: b.name, header, cards, commit, expanded: false });
  }

  // ── Compare button (center, floats at lower height) ──────────────────────
  const compareBtn = plane(CMP_W, CMP_H, makeCompareTex());
  compareBtn.position.set(0, CMP_Y, Z - 0.3);   // slightly closer than panels
  compareBtn.material.opacity = 0;
  compareBtn.visible = false;
  compareBtn.userData = { type: 'compare' };
  scene.add(compareBtn);
  interactables.push(compareBtn);

  // ── Expand / collapse ─────────────────────────────────────────────────────
  function setExpanded(branchName) {
    for (const p of panels) {
      const open      = p.name === branchName ? !p.expanded : false;
      const wasOpen   = p.expanded;
      p.expanded      = open;
      p.cards.forEach(c => { c.visible = open; });
      p.commit.visible = open;
      p.header.material.color.setHex(open ? 0xccffcc : 0xffffff);
      if (open && !wasOpen) {
        branchOpenTime[branchName] = performance.now();
        onBranchOpen(branchName);
      }
    }
  }

  // ── Card layer cycling ────────────────────────────────────────────────────
  function cycleCardLayer(mesh) {
    const d    = mesh.userData;
    const next = (d.layer + 1) % 3;
    d.layer    = next;
    drawCardLayer(d.cvRef.getContext('2d'), d.cvRef.width, d.cvRef.height, d.cardData, d.branchColor, next);
    d.texRef.needsUpdate = true;

    if (next > d.maxLayer) {
      d.maxLayer = next;
      onLayerViewed(d.branch, d.cardIndex, next);
    }
  }

  // ── Select handler ────────────────────────────────────────────────────────
  function onSelect(object) {
    const { type, branch } = object.userData;
    if (type === 'panel_header') {
      setExpanded(branch);
    } else if (type === 'card') {
      cycleCardLayer(object);
    } else if (type === 'commit') {
      const openedAt = branchOpenTime[branch] ?? performance.now();
      onCommit(branch, performance.now() - openedAt);
    } else if (type === 'compare') {
      onCompare();
    }
  }

  // ── Fade-in helpers ───────────────────────────────────────────────────────
  function beginFadeIn() {
    for (const p of panels) { p.header.visible = true; p.header.material.opacity = 0; }
    compareBtn.visible = true; compareBtn.material.opacity = 0;
  }

  function setHeaderOpacity(v) {
    for (const p of panels) p.header.material.opacity = v;
    compareBtn.material.opacity = v;
  }

  function getCardMeshes(branchName) { return cardsByBranch[branchName] ?? []; }

  return { interactables, onSelect, allCardMeshes, getCardMeshes, beginFadeIn, setHeaderOpacity };
}
