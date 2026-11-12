import * as THREE from 'three';
import { CFG } from './config.js';

// Procedural wood frame with a simple stepped bevel and a plain white mat.
const S = CFG.seigaiha;

function bakeWood() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#5a3a20';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * size;
    g.fillStyle = `rgba(${90 + Math.random() * 40},${58 + Math.random() * 26},${28 + Math.random() * 16},0.25)`;
    g.fillRect(0, y, size, 1 + Math.random() * 5);
  }
  for (let i = 0; i < 160; i++) {
    const y0 = Math.random() * size;
    const cycles = 1 + Math.floor(Math.random() * 3);
    g.strokeStyle = `rgba(${20 + Math.random() * 34},${12 + Math.random() * 20},${5 + Math.random() * 12},${0.05 + Math.random() * 0.13})`;
    g.lineWidth = 0.5 + Math.random() * 1.7;
    g.beginPath();
    for (let x = 0; x <= size; x += 6) {
      const yy = y0 + Math.sin((x / size) * Math.PI * 2 * cycles + i) * (1 + Math.random() * 1.5);
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

let shared = null;

export function getFrameAssets() {
  if (shared) return shared;
  const wood = bakeWood();
  shared = {
    wood,
    woodMat: new THREE.MeshStandardMaterial({
      map: wood,
      roughness: 0.52,
      metalness: 0.12,
    }),
    boardMat: new THREE.MeshStandardMaterial({
      color: S.boardColor,
      roughness: 0.95,
      metalness: 0,
    }),
    backingMat: new THREE.MeshStandardMaterial({
      color: S.backing,
      roughness: 0.9,
      metalness: 0.05,
    }),
  };
  return shared;
}

// Own stepped bevel profile: t measures in from the outer edge; z is forward depth.
const PROFILE = [
  [0, -0.07],
  [0, 0.005],
  [S.border * 0.16, 0.045],
  [S.border * 0.32, 0.05],
  [S.border * 0.43, 0.025],
  [S.border * 0.55, 0.018],
  [S.border * 0.72, 0.025],
  [S.border * 0.82, 0.01],
  [S.border, 0.006],
  [S.border, -0.07],
];

function miterRail(length, across, side, vertical, material) {
  const pos = [];
  const uv = [];
  const idx = [];
  const point = (t, z, end) => {
    const along = end * (length / 2 - t - 0.0013);
    const cross = side * (across / 2 - t);
    return vertical ? [cross, along, z] : [along, cross, z];
  };
  const push = (p, u, v) => {
    pos.push(p[0], p[1], p[2]);
    uv.push(u, v);
  };
  const uMax = length * 0.5;
  for (let i = 0; i < PROFILE.length; i++) {
    const a = PROFILE[i];
    const b = PROFILE[(i + 1) % PROFILE.length];
    const n = pos.length / 3;
    push(point(a[0], a[1], -1), 0, a[0] * 5);
    push(point(a[0], a[1], 1), uMax, a[0] * 5);
    push(point(b[0], b[1], 1), uMax, b[0] * 5);
    push(point(b[0], b[1], -1), 0, b[0] * 5);
    if (vertical ? side < 0 : side > 0) idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    else idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const cap = THREE.ShapeUtils.triangulateShape(
    PROFILE.map(([t, z]) => new THREE.Vector2(t, z)),
    []
  );
  for (const end of [-1, 1]) {
    const n = pos.length / 3;
    for (const v of PROFILE) push(point(v[0], v[1], end), 0, 0);
    const outward = vertical ? new THREE.Vector3(-side, end, 0) : new THREE.Vector3(end, -side, 0);
    for (const tri of cap) {
      const a = new THREE.Vector3().fromArray(pos, (n + tri[0]) * 3);
      const b = new THREE.Vector3().fromArray(pos, (n + tri[1]) * 3);
      const c = new THREE.Vector3().fromArray(pos, (n + tri[2]) * 3);
      const normal = b.sub(a).cross(c.sub(a));
      const face = normal.dot(outward) < 0 ? [tri[0], tri[2], tri[1]] : tri;
      idx.push(...face.map((v) => v + n));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, material);
}

// Frame local coords: white mat at z=0, photo at z≈0.035, bevel front at z=0.05.
export function buildFrame(photoW, photoH) {
  const assets = getFrameAssets();
  const openW = photoW + S.margin * 2;
  const openH = photoH + S.margin * 2;
  const outerW = openW + S.border * 2;
  const outerH = openH + S.border * 2;

  const group = new THREE.Group();

  const panelW = openW + 0.09;
  const panelH = openH + 0.09;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), assets.boardMat);
  group.add(panel);

  const backing = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.09), assets.backingMat);
  backing.position.z = -0.07;
  group.add(backing);

  for (const side of [-1, 1]) {
    group.add(miterRail(outerW, outerH, side, false, assets.woodMat));
    group.add(miterRail(outerH, outerW, side, true, assets.woodMat));
  }

  group.userData.outerW = outerW;
  group.userData.outerH = outerH;
  return group;
}

export function disposeFrameAssets() {
  if (!shared) return;
  const { wood, woodMat, boardMat, backingMat } = shared;
  wood.dispose();
  woodMat.dispose();
  boardMat.dispose();
  backingMat.dispose();
  shared = null;
}
