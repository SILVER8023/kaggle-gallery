import * as THREE from 'three';
import { CFG } from './config.js';
import { frameX } from './layout.js';

function radialTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 236, 205, 0.95)');
  gradient.addColorStop(0.45, 'rgba(255, 220, 170, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 220, 170, 0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildEnvironment(scene, count) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const { spacing, centerY, wallZ, floorY, spotY, spotZ } = CFG.gallery;
  const length = Math.max(90, (count + 10) * spacing);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(length, 100),
    new THREE.MeshStandardMaterial({ color: CFG.colors.floor, roughness: 0.38, metalness: 0.4 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, floorY, 0);
  group.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(length, 22),
    new THREE.MeshStandardMaterial({ color: CFG.colors.wall, roughness: 0.96, metalness: 0.04 })
  );
  wall.position.set(0, 9, wallZ);
  group.add(wall);

  const glow = radialTexture();
  // One shared additive material per layer group: every pool/halo fades in step.
  const poolMat = new THREE.MeshBasicMaterial({
    map: glow,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: CFG.colors.spot,
    side: THREE.DoubleSide,
  });
  const haloMat = poolMat.clone();
  haloMat.opacity = 0;

  const poolGeo = new THREE.PlaneGeometry(6.4, 4.8);
  const haloGeo = new THREE.PlaneGeometry(5.8, 5.8);
  const canGeo = new THREE.CylinderGeometry(0.08, 0.11, 0.32, 14);
  const canMat = new THREE.MeshStandardMaterial({
    color: 0x141414,
    emissive: CFG.colors.spot,
    emissiveIntensity: 0,
    roughness: 0.5,
    metalness: 0.65,
  });

  const pools = [];
  const halos = [];
  const cans = [];

  for (let i = 0; i < count; i++) {
    const x = frameX(i, count);

    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, floorY + 0.02, 1.15);
    group.add(pool);
    pools.push(pool);

    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(x, centerY + 0.45, wallZ + 0.07);
    group.add(halo);
    halos.push(halo);

    const can = new THREE.Mesh(canGeo, canMat);
    can.position.set(x, spotY + 1.35, spotZ);
    group.add(can);
    cans.push(can);
  }

  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, centerY, 0);
  scene.add(spotTarget);

  const { spotAngle, spotPenumbra, spotDecay, spotDistance, fillAngle } = CFG.lights;
  const spotlight = new THREE.SpotLight(
    CFG.colors.spot,
    0,
    spotDistance,
    spotAngle,
    spotPenumbra,
    spotDecay
  );
  spotlight.position.set(0, spotY, spotZ);
  spotlight.visible = false;
  spotlight.target = spotTarget;
  scene.add(spotlight);

  const fill = new THREE.SpotLight(CFG.colors.spot, 0, 44, fillAngle, 1.0, 1.0);
  fill.position.copy(spotlight.position);
  fill.visible = false;
  fill.target = spotTarget;
  scene.add(fill);

  return {
    group,
    spotlight,
    fill,
    spotTarget,
    poolMat,
    haloMat,
    canMat,
    glow,
    geometry: [floor.geometry, wall.geometry, poolGeo, haloGeo, canGeo],
    materialDisposables: [floor.material, wall.material],
  };
}
