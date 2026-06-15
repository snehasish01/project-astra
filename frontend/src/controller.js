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

export function setupControllers(renderer, scene, interactables, onSelect, onHoverChange = () => {}) {
  const cursor = makeCursor();
  scene.add(cursor);

  let hovered = null;

  function setHover(mesh, on) {
    if (!mesh) return;
    mesh.material.color.setHex(on ? 0xaaddff : 0xffffff);
  }

  const controllers = [0, 1].map(i => {
    const c = renderer.xr.getController(i);
    c.add(makeRayLine());
    scene.add(c);
    c.addEventListener('select', () => { if (hovered) onSelect(hovered); });
    return c;
  });

  function update() {
    if (!renderer.xr.isPresenting) return;

    let hitObject = null;
    let hitPoint  = null;

    for (const c of controllers) {
      _mat4.identity().extractRotation(c.matrixWorld);
      _raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
      _raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_mat4);

      const visible = interactables.filter(o => o.visible);
      const hits = _raycaster.intersectObjects(visible, false);

      if (hits.length > 0) {
        hitObject = hits[0].object;
        hitPoint  = hits[0].point;
        break;
      }
    }

    if (hitPoint) {
      cursor.position.copy(hitPoint);
      cursor.visible = true;
    } else {
      cursor.visible = false;
    }

    if (hitObject !== hovered) {
      setHover(hovered, false);
      if (hovered) onHoverChange(hovered, false);

      setHover(hitObject, true);
      if (hitObject) onHoverChange(hitObject, true);

      hovered = hitObject;
    }
  }

  return { update };
}
