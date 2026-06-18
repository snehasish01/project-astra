import * as THREE from 'three';

const CW = 1024, CH = 520;
const CARD_W = 0.92, CARD_H = 0.468;  // maintains canvas aspect ratio
const DIST   = 1.2;  // metres in front of camera

function buildCardTex(question) {
  const cv  = document.createElement('canvas');
  cv.width  = CW; cv.height = CH;
  const ctx = cv.getContext('2d');

  // Dark background
  ctx.fillStyle = '#07101f';
  ctx.fillRect(0, 0, CW, CH);

  // Layered amber glow border
  for (let i = 4; i >= 0; i--) {
    const pad = 6 + i * 8;
    ctx.beginPath();
    ctx.roundRect(pad, pad, CW - pad * 2, CH - pad * 2, 20 - i);
    ctx.strokeStyle = `rgba(255,179,0,${0.08 + i * 0.04})`;
    ctx.lineWidth   = 10 - i * 1.5;
    ctx.stroke();
  }

  // Crisp amber border
  ctx.beginPath();
  ctx.roundRect(18, 18, CW - 36, CH - 36, 14);
  ctx.strokeStyle = '#ffb300';
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // Header label
  ctx.fillStyle    = '#ffb300';
  ctx.font         = 'bold 26px system-ui, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('A QUESTION BEFORE YOU GO', CW / 2, 38);

  // Divider
  ctx.strokeStyle = 'rgba(255,179,0,0.25)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(70, 90); ctx.lineTo(CW - 70, 90); ctx.stroke();

  // Question text (word-wrapped, centred)
  ctx.fillStyle    = '#ddeeff';
  ctx.font         = 'italic 50px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  const maxW = CW - 110;
  const lineH = 68;
  let y = 114;
  const words = question.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, CW / 2, y);
      line = word; y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, CW / 2, y);

  return new THREE.CanvasTexture(cv);
}

function buildBtnTex(label, bg) {
  const cv  = document.createElement('canvas');
  cv.width  = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 116, 16);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 50px system-ui, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 64);
  return new THREE.CanvasTexture(cv);
}

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function createAcdCard(scene, camera) {
  // ── Card mesh ─────────────────────────────────────────────────────────────────
  const cardMat  = new THREE.MeshBasicMaterial({ transparent: true });
  const card     = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), cardMat);
  card.visible   = false;
  scene.add(card);

  // ── Buttons ───────────────────────────────────────────────────────────────────
  const reconsiderBtn = new THREE.Mesh(
    new THREE.PlaneGeometry(0.33, 0.082),
    new THREE.MeshBasicMaterial({
      map: buildBtnTex('Reconsider', '#6b1010'), transparent: true,
    }),
  );
  reconsiderBtn.visible  = false;
  reconsiderBtn.userData = { type: 'acd_reconsider' };
  scene.add(reconsiderBtn);

  const commitAnywayBtn = new THREE.Mesh(
    new THREE.PlaneGeometry(0.33, 0.082),
    new THREE.MeshBasicMaterial({
      map: buildBtnTex('Commit Anyway', '#0d3320'), transparent: true,
    }),
  );
  commitAnywayBtn.visible  = false;
  commitAnywayBtn.userData = { type: 'acd_commit_anyway' };
  scene.add(commitAnywayBtn);

  let _onReconsider   = null;
  let _onCommitAnyway = null;

  // ── Positioning ───────────────────────────────────────────────────────────────
  function snapToCamera() {
    camera.getWorldPosition(_pos);
    camera.getWorldDirection(_dir);

    card.position.set(
      _pos.x + _dir.x * DIST,
      _pos.y + _dir.y * DIST,
      _pos.z + _dir.z * DIST,
    );
    card.lookAt(_pos);

    // Buttons sit just below card, spaced apart
    const btnY = card.position.y - CARD_H / 2 - 0.052;
    reconsiderBtn.position.set(card.position.x - 0.185, btnY, card.position.z);
    reconsiderBtn.lookAt(_pos);
    commitAnywayBtn.position.set(card.position.x + 0.185, btnY, card.position.z);
    commitAnywayBtn.lookAt(_pos);
  }

  function update() {
    if (card.visible) snapToCamera();
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  function show(question, onReconsider, onCommitAnyway) {
    _onReconsider   = onReconsider;
    _onCommitAnyway = onCommitAnyway;

    cardMat.map = buildCardTex(question);
    cardMat.needsUpdate = true;

    card.visible          = true;
    reconsiderBtn.visible = true;
    commitAnywayBtn.visible = true;

    snapToCamera();

    // Speech synthesis
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utt    = new SpeechSynthesisUtterance(question);
      utt.rate     = 0.88;
      utt.pitch    = 1.0;
      utt.volume   = 0.85;
      speechSynthesis.speak(utt);
    }

    // Haptic pulse on all XR controllers
    for (const gp of navigator.getGamepads()) {
      if (gp?.hapticActuators?.[0]) {
        gp.hapticActuators[0].pulse(0.5, 400);
      }
    }
  }

  function hide() {
    card.visible            = false;
    reconsiderBtn.visible   = false;
    commitAnywayBtn.visible = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    _onReconsider = _onCommitAnyway = null;
  }

  // Returns true if the selected object was handled by this card
  function onSelect(obj) {
    if (obj === reconsiderBtn && _onReconsider)     { _onReconsider();   return true; }
    if (obj === commitAnywayBtn && _onCommitAnyway) { _onCommitAnyway(); return true; }
    return false;
  }

  return {
    interactables: [reconsiderBtn, commitAnywayBtn],
    show,
    hide,
    onSelect,
    update,
    isVisible: () => card.visible,
  };
}
