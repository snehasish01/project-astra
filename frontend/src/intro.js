import * as THREE from 'three';

// Intro card: 0.90 × 0.50 m  →  canvas 1024 × 568  (ratio 1.803 ≈ 1.80)
// Begin btn:  0.52 × 0.13 m  →  canvas  512 × 128  (ratio 4.0)
const CARD_W = 0.90, CARD_H = 0.50;
const BTN_W  = 0.52, BTN_H  = 0.13;
const Z      = -1.5;
const CARD_Y = 1.63;
const BTN_Y  = 1.27;

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function makeIntroTex() {
  const cw = 1024, ch = 568;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');

  // Background
  roundedRect(ctx, 0, 0, cw, ch, 0);
  ctx.fillStyle = '#070d1a'; ctx.fill();

  // Gold border
  roundedRect(ctx, 5, 5, cw - 10, ch - 10, 22);
  ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 5; ctx.stroke();

  // Inner subtle glow band at top
  const grad = ctx.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, 'rgba(255,213,79,0.08)');
  grad.addColorStop(1, 'rgba(255,213,79,0)');
  roundedRect(ctx, 5, 5, cw - 10, ch - 10, 22);
  ctx.fillStyle = grad; ctx.fill();

  ctx.textAlign = 'center';

  // Context lines
  ctx.fillStyle = '#b0c8f0';
  ctx.font = '44px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText("You're a mid-career professional.", cw / 2, 95);
  ctx.fillText('AI is disrupting your field.', cw / 2, 155);

  // Main question — gold, larger
  ctx.fillStyle = '#ffd54f';
  ctx.font = 'bold 76px system-ui, sans-serif';
  ctx.fillText("What's your move?", cw / 2, 270);

  // Separator
  ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 335); ctx.lineTo(cw - 80, 335); ctx.stroke();

  // Subtext
  ctx.fillStyle = '#607d8b';
  ctx.font = 'italic 38px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Explore each path, then commit to one.', cw / 2, 390);

  return new THREE.CanvasTexture(c);
}

function makeBeginTex() {
  const cw = 512, ch = 128;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');

  roundedRect(ctx, 5, 5, cw - 10, ch - 10, 16);
  ctx.fillStyle = '#1565c0'; ctx.fill();

  ctx.strokeStyle = '#42a5f5'; ctx.lineWidth = 3;
  roundedRect(ctx, 8, 8, cw - 16, ch - 16, 13);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Begin Exploration', cw / 2, ch / 2);

  return new THREE.CanvasTexture(c);
}

export function createIntro(scene) {
  const cardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: makeIntroTex(), transparent: true }),
  );
  cardMesh.position.set(0, CARD_Y, Z);
  scene.add(cardMesh);

  const btnMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(BTN_W, BTN_H),
    new THREE.MeshBasicMaterial({ map: makeBeginTex(), transparent: true }),
  );
  btnMesh.position.set(0, BTN_Y, Z);
  btnMesh.userData = { type: 'begin_exploration' };
  scene.add(btnMesh);

  function setOpacity(v) {
    cardMesh.material.opacity = v;
    btnMesh.material.opacity  = v;
  }

  function hide() {
    cardMesh.visible = false;
    btnMesh.visible  = false;
  }

  return {
    interactables: [btnMesh],
    setOpacity,
    hide,
  };
}
