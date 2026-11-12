import * as THREE from 'three';
import { CFG } from './config.js';

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createParticleField(scene) {
  const { count, size, opacity, linkOpacity, linkDistance, maxLinks, bounds } = CFG.particles;
  const rand = mulberry32(99173);

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rand() - 0.5) * bounds.x;
    positions[i * 3 + 1] = bounds.yMin + rand() * (bounds.yMax - bounds.yMin);
    positions[i * 3 + 2] = bounds.zMin + rand() * (bounds.zMax - bounds.zMin);
    velocities[i * 3] = (rand() - 0.5) * 0.05;
    velocities[i * 3 + 1] = (rand() - 0.5) * 0.04;
    velocities[i * 3 + 2] = (rand() - 0.5) * 0.02;
  }

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pointMaterial = new THREE.PointsMaterial({
    color: CFG.colors.star,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pointGeometry, pointMaterial);
  points.frustumCulled = false;
  scene.add(points);

  const maxSegments = count * maxLinks;
  const linePositions = new Float32Array(maxSegments * 6);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setDrawRange(0, 0);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: CFG.colors.line,
    transparent: true,
    opacity: linkOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.frustumCulled = false;
  scene.add(lines);

  const linkDistanceSq = linkDistance * linkDistance;

  function update(dt) {
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      positions[o] += velocities[o] * dt * 60;
      positions[o + 1] += velocities[o + 1] * dt * 60;
      positions[o + 2] += velocities[o + 2] * dt * 60;
      if (positions[o] < -bounds.x || positions[o] > bounds.x) velocities[o] *= -1;
      if (positions[o + 1] < bounds.yMin || positions[o + 1] > bounds.yMax) velocities[o + 1] *= -1;
      if (positions[o + 2] < bounds.zMin || positions[o + 2] > bounds.zMax) velocities[o + 2] *= -1;
    }
    pointGeometry.attributes.position.needsUpdate = true;

    let cursor = 0;
    for (let i = 0; i < count; i++) {
      let linked = 0;
      const ai = i * 3;
      for (let j = i + 1; j < count && linked < maxLinks; j++) {
        const bj = j * 3;
        const dx = positions[ai] - positions[bj];
        const dy = positions[ai + 1] - positions[bj + 1];
        const dz = positions[ai + 2] - positions[bj + 2];
        if (dx * dx + dy * dy + dz * dz > linkDistanceSq) continue;
        linePositions[cursor++] = positions[ai];
        linePositions[cursor++] = positions[ai + 1];
        linePositions[cursor++] = positions[ai + 2];
        linePositions[cursor++] = positions[bj];
        linePositions[cursor++] = positions[bj + 1];
        linePositions[cursor++] = positions[bj + 2];
        linked += 1;
      }
    }
    lineGeometry.setDrawRange(0, cursor / 3);
    lineGeometry.attributes.position.needsUpdate = true;
  }

  function dispose() {
    scene.remove(points);
    scene.remove(lines);
    pointGeometry.dispose();
    pointMaterial.dispose();
    lineGeometry.dispose();
    lineMaterial.dispose();
  }

  return { points, lines, pointMaterial, lineMaterial, update, dispose };
}
