import * as THREE from 'three';

const _mat4 = new THREE.Matrix4();
const _raycaster = new THREE.Raycaster();
_raycaster.far = 4.0;

function makeRayLine() {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -4),
  ]);
  return new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }),
  );
}

function makeCursor() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  mesh.visible = false;
  return mesh;
}

export function setupControllers(renderer, scene, interactables, onSelect) {
  const cursor = makeCursor();
  scene.add(cursor);

  let hovered = null;

  function setHover(mesh, on) {
    if (!mesh) return;
    // MeshBasicMaterial.color multiplies the texture — white = no tint
    mesh.material.color.setHex(on ? 0xaaddff : 0xffffff);
  }

  const controllers = [0, 1].map(i => {
    const c = renderer.xr.getController(i);
    c.add(makeRayLine());
    scene.add(c);

    c.addEventListener('select', () => {
      if (hovered) onSelect(hovered);
    });

    return c;
  });

  function update() {
    if (!renderer.xr.isPresenting) return;

    let hitObject = null;
    let hitPoint  = null;

    // Check both controllers; first hit wins
    for (const c of controllers) {
      _mat4.identity().extractRotation(c.matrixWorld);
      _raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
      _raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_mat4);

      // Only test visible objects (Three.js does not filter by .visible automatically)
      const visible = interactables.filter(o => o.visible);
      const hits = _raycaster.intersectObjects(visible, false);

      if (hits.length > 0) {
        hitObject = hits[0].object;
        hitPoint  = hits[0].point;
        break;
      }
    }

    // Update cursor
    if (hitPoint) {
      cursor.position.copy(hitPoint);
      cursor.visible = true;
    } else {
      cursor.visible = false;
    }

    // Update hover highlight
    if (hitObject !== hovered) {
      setHover(hovered, false);
      setHover(hitObject, true);
      hovered = hitObject;
    }
  }

  return { update };
}
