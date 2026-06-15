import * as THREE from 'three';
import { sendEvent } from './socket.js';

const _ray  = new THREE.Raycaster();
const _pos  = new THREE.Vector3();
const _dir  = new THREE.Vector3();

_ray.far = 4;

const DWELL_THRESHOLD = 2500; // ms — below this at commit time = SKIMMED
const LOG_PERIOD      = 2000; // ms wall-clock between periodic console logs

export function createGazeTracker(camera, cardMeshes) {
  // Per-card dwell state
  const dwellState = new Map();
  for (const m of cardMeshes) {
    dwellState.set(m, { total: 0, gazeStart: null, dwellFired: false });
  }

  let currentCard = null;
  let lastLogTime  = 0;

  // Total accumulated dwell including any in-progress gaze
  function getTotal(mesh) {
    const s = dwellState.get(mesh);
    if (!s) return 0;
    return s.gazeStart !== null
      ? s.total + (performance.now() - s.gazeStart)
      : s.total;
  }

  function isSkimmed(mesh) {
    return getTotal(mesh) < DWELL_THRESHOLD;
  }

  function update(timestamp) {
    camera.getWorldPosition(_pos);
    camera.getWorldDirection(_dir);
    _ray.set(_pos, _dir);

    const visible = cardMeshes.filter(m => m.visible);
    const gazed   = _ray.intersectObjects(visible, false)[0]?.object ?? null;

    if (gazed !== currentCard) {
      // ── exit previous card ────────────────────────────────────────────────
      if (currentCard) {
        const s = dwellState.get(currentCard);
        if (s.gazeStart !== null) {
          s.total    += timestamp - s.gazeStart;
          s.gazeStart = null;
        }
        const { branch, cardIndex } = currentCard.userData;
        sendEvent('gaze_exit', { branch, card: cardIndex, dwellMs: Math.round(s.total) });
      }

      // ── enter new card ────────────────────────────────────────────────────
      if (gazed) {
        const s = dwellState.get(gazed);
        s.gazeStart  = timestamp;
        lastLogTime  = timestamp; // reset so first log fires after LOG_PERIOD
        const { branch, cardIndex } = gazed.userData;
        sendEvent('gaze_enter', { branch, card: cardIndex });
      }

      currentCard = gazed;
    }

    if (!currentCard) return;

    const s     = dwellState.get(currentCard);
    const total = s.total + (timestamp - s.gazeStart);

    // One-shot dwell_complete event
    if (!s.dwellFired && total >= DWELL_THRESHOLD) {
      s.dwellFired = true;
      const { branch, cardIndex } = currentCard.userData;
      sendEvent('dwell_complete', { branch, card: cardIndex });
    }

    // Periodic console log every LOG_PERIOD ms
    if (timestamp - lastLogTime >= LOG_PERIOD) {
      const { branch, cardIndex, cardTitle } = currentCard.userData;
      const flag = total < DWELL_THRESHOLD ? ' | SKIMMED (<2500ms)' : '';
      console.log(`[gaze] ${branch} › ${cardTitle ?? `card ${cardIndex}`} | dwell: ${Math.round(total)}ms${flag}`);
      lastLogTime = timestamp;
    }
  }

  return { update, getTotal, isSkimmed };
}
