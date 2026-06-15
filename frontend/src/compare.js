import * as THREE from 'three';

// Canvas 1024 × 380  →  mesh 1.40 × 0.519 m  (ratio 2.693)
const CW = 1024, CH = 380;
const MW = 1.40, MH = 0.519;
const Z  = -1.0;     // in front of the panels (which are at -1.5)
const Y  = 1.48;

const COL_W  = Math.floor(CW / 3);   // 341 px per column
const COLORS  = { Upskill: '#42a5f5', Pivot: '#ffa726', Automate: '#66bb6a' };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

function buildTex(branches) {
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const ctx = cv.getContext('2d');

  // Overall background
  rr(ctx, 0, 0, CW, CH, 0);
  ctx.fillStyle = '#050c1a'; ctx.fill();

  // Header bar
  ctx.fillStyle = '#0d1e38';
  ctx.fillRect(0, 0, CW, 52);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COMPARE ALL PATHS', CW / 2, 26);

  branches.forEach((b, col) => {
    const x0 = col * COL_W;

    // Column background
    ctx.fillStyle = col % 2 === 0 ? '#07111f' : '#060f1c';
    ctx.fillRect(x0, 52, COL_W, CH - 52);

    // Branch colour strip at top of column
    ctx.fillStyle = COLORS[b.name];
    ctx.fillRect(x0, 52, COL_W, 6);

    // Vertical separator
    if (col > 0) {
      ctx.fillStyle = '#1a2f4a';
      ctx.fillRect(x0, 52, 2, CH - 52);
    }

    // Branch name
    ctx.fillStyle = COLORS[b.name];
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(b.name, x0 + COL_W / 2, 64);

    // Cards
    b.cards.forEach((c, i) => {
      const cardY = 112 + i * 82;

      // Card background pill
      rr(ctx, x0 + 10, cardY, COL_W - 20, 72, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(c.title, x0 + 20, cardY + 8);

      ctx.fillStyle = '#7090b0';
      ctx.font = '20px system-ui, sans-serif';
      // Truncate sub to fit column
      let sub = c.sub;
      while (ctx.measureText(sub).width > COL_W - 32 && sub.length > 10) {
        sub = sub.slice(0, -4) + '…';
      }
      ctx.fillText(sub, x0 + 20, cardY + 40);
    });
  });

  return new THREE.CanvasTexture(cv);
}

// ── Close button ─────────────────────────────────────────────────────────────

function buildCloseTex() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 72;
  const ctx = cv.getContext('2d');
  rr(ctx, 4, 4, 248, 64, 12);
  ctx.fillStyle = '#1a3050'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Close ×', 128, 36);
  return new THREE.CanvasTexture(cv);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createCompare(scene, branches) {
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(MW, MH),
    new THREE.MeshBasicMaterial({ map: buildTex(branches), transparent: true }),
  );
  card.position.set(0, Y, Z);
  card.visible = false;
  scene.add(card);

  const closeBtn = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.068),
    new THREE.MeshBasicMaterial({ map: buildCloseTex(), transparent: true }),
  );
  closeBtn.position.set(0, Y - MH / 2 - 0.055, Z);
  closeBtn.visible = false;
  closeBtn.userData = { type: 'compare_close' };
  scene.add(closeBtn);

  function show() { card.visible = true;  closeBtn.visible = true;  }
  function hide() { card.visible = false; closeBtn.visible = false; }

  return { interactables: [closeBtn], show, hide };
}
