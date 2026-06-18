import * as THREE from 'three';

// Positions match canvas.js constants exactly: CMT_Y=0.35, Z=-1.5
const COMMIT_POS = {
  Upskill:  { x: -0.85, y: 0.35, z: -1.5 },
  Pivot:    { x:  0.00, y: 0.35, z: -1.5 },
  Automate: { x:  0.85, y: 0.35, z: -1.5 },
};

// Canvas matches commit button aspect ratio: CMT_W/CMT_H = 0.38/0.095 = 4.0
const CW = 512, CH = 128;
const CORNER_R = 16;

// Approximate perimeter of the rounded-rect border we animate
const BORDER_INSET = 5;
const RW = CW - BORDER_INSET * 2;
const RH = CH - BORDER_INSET * 2;
const PERIMETER = 2 * (RW - 2 * CORNER_R) + 2 * (RH - 2 * CORNER_R) + 2 * Math.PI * CORNER_R;

function drawLockOutline(ctx, progress) {
  ctx.clearRect(0, 0, CW, CH);

  // Faint track (full outline, always visible while ring is active)
  ctx.beginPath();
  ctx.roundRect(BORDER_INSET, BORDER_INSET, RW, RH, CORNER_R);
  ctx.strokeStyle = 'rgba(255, 55, 55, 0.22)';
  ctx.lineWidth = 9;
  ctx.setLineDash([]);
  ctx.stroke();

  // Sweeping progress arc — fills clockwise from top-left corner
  if (progress > 0) {
    ctx.beginPath();
    ctx.roundRect(BORDER_INSET, BORDER_INSET, RW, RH, CORNER_R);
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.setLineDash([PERIMETER * progress, PERIMETER]);
    ctx.lineDashOffset = 0;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function createLockRings(scene) {
  const rings = {};

  for (const [branch, pos] of Object.entries(COMMIT_POS)) {
    const cv  = document.createElement('canvas');
    cv.width  = CW; cv.height = CH;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);

    // Same physical size as commit button, placed just in front of it
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.095),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    mesh.position.set(pos.x, pos.y, pos.z + 0.002);
    mesh.visible = false;
    scene.add(mesh);

    rings[branch] = { mesh, ctx, tex, startMs: null, durationMs: null, onComplete: null };
  }

  let activeBranch = null;

  function start(branch, durationMs, onComplete) {
    const ring = rings[branch];
    if (!ring) return;

    activeBranch       = branch;
    ring.startMs       = performance.now();
    ring.durationMs    = durationMs;
    ring.onComplete    = onComplete;
    ring.mesh.visible  = true;

    drawLockOutline(ring.ctx, 0);
    ring.tex.needsUpdate = true;
  }

  function stop(branch) {
    const ring = rings[branch];
    if (!ring) return;
    ring.mesh.visible = false;
    ring.startMs      = null;
    if (activeBranch === branch) activeBranch = null;
  }

  function update() {
    if (!activeBranch) return;
    const ring = rings[activeBranch];
    if (!ring?.startMs) return;

    const elapsed  = performance.now() - ring.startMs;
    const progress = Math.min(elapsed / ring.durationMs, 1);

    drawLockOutline(ring.ctx, progress);
    ring.tex.needsUpdate = true;

    if (progress >= 1) {
      const cb = ring.onComplete;
      stop(activeBranch);
      if (cb) cb();
    }
  }

  return { start, stop, update };
}
