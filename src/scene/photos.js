import * as THREE from 'three';
import { CFG } from './config.js';
import { buildFrame } from './seigaiha.js';

function createPaperMaterial(texture, width, height, { radius = 0, key = 'intro' } = {}) {
  const uniformCurl = { value: new THREE.Vector2(0, 0) };
  const uniformSize = { value: new THREE.Vector2(width, height) };
  const uniformRadius = { value: radius };

  const material = new THREE.MeshPhysicalMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: CFG.paper.introEmissive,
    roughness: CFG.paper.roughness,
    metalness: 0,
    clearcoat: CFG.paper.clearcoat,
    clearcoatRoughness: 0.55,
    toneMapped: false,
    alphaToCoverage: true,
  });

  // Subdivided plane + a small vertex bend keeps the print reading as paper
  // under the moving light without a per-frame CPU deformation pass. The same
  // shader rounds the gallery cards; the wall print keeps square corners.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCurl = uniformCurl;
    shader.uniforms.uSize = uniformSize;
    shader.uniforms.uRadius = uniformRadius;
    shader.vertexShader =
      'uniform vec2 uCurl;\nuniform vec2 uSize;\nvarying vec2 vPaperUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vPaperUv = uv;
       float paperU = position.x / max(uSize.x, 0.001);
       float paperV = position.y / max(uSize.y, 0.001);
       transformed.z += (uCurl.x * (paperU * paperU - 0.0833)
                       + uCurl.y * (paperV * paperV - 0.0833)) * 3.0;`
    );
    shader.fragmentShader =
      'uniform vec2 uSize;\nuniform float uRadius;\nvarying vec2 vPaperUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `float paperCoverage = 1.0;
       if (uRadius > 0.0001) {
         vec2 halfSize = uSize * 0.5;
         vec2 q = abs(vPaperUv - 0.5) * uSize - (halfSize - vec2(uRadius));
         float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
         paperCoverage = 1.0 - smoothstep(-0.0025, 0.0005, dist);
       }
       gl_FragColor.a *= paperCoverage;
       #include <dithering_fragment>`
    );
    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () => `paper-${key}-v2`;
  return { material, uniforms: { curl: uniformCurl, size: uniformSize, radius: uniformRadius } };
}

function invisibleHitMaterial() {
  const material = new THREE.MeshBasicMaterial();
  material.visible = false;
  return material;
}

export function createArtwork({ texture, aspect, index, metadata }) {
  const group = new THREE.Group();
  const height = CFG.photo.baseH;
  const width = height * aspect;

  const intro = createPaperMaterial(texture, width, height, {
    radius: CFG.photo.radius,
    key: 'intro',
  });
  const wall = createPaperMaterial(texture, width, height, { radius: 0, key: 'wall' });
  wall.material.emissiveIntensity = CFG.paper.galleryEmissive;
  const introMaterial = intro.material;
  const wallMaterial = wall.material;
  const uniformCurl = intro.uniforms.curl;

  const geometry = new THREE.PlaneGeometry(width, height, CFG.photo.segments, CFG.photo.segments);
  const mesh = new THREE.Mesh(geometry, introMaterial);
  mesh.position.z = 0.035;
  mesh.userData.artworkIndex = index;
  group.add(mesh);

  const hitGeometry = new THREE.PlaneGeometry(width + 0.42, height + 0.42);
  const hitMesh = new THREE.Mesh(hitGeometry, invisibleHitMaterial());
  hitMesh.position.z = 0.05;
  hitMesh.userData.artworkIndex = index;
  group.add(hitMesh);

  const frame = buildFrame(width, height);
  frame.visible = false;
  frame.scale.setScalar(0.001);
  group.add(frame);

  return {
    index,
    group,
    mesh,
    hitMesh,
    frame,
    width,
    height,
    aspect,
    metadata,
    introMaterial,
    wallMaterial,
    material: introMaterial,
    uniformCurl,
    layer: 0,
    base: new THREE.Vector3(),
    baseRotation: new THREE.Euler(),
    wallPosition: new THREE.Vector3(),
    scaleSmooth: 1,
    bobPhase: 0,
    hoverAmount: 0,
    dragVelocity: new THREE.Vector2(),
    dragRotation: new THREE.Vector2(),
    mode: 'intro', // intro | wall | detail | hidden
    rotationTweening: false,
    tweenToken: 0,
    emissiveSmooth: CFG.paper.introEmissive,
    tint: 1,
    tiltUv: new THREE.Vector2(0.5, 0.5),
  };
}

// Five concentric rings receding into the dark, wide enough to read as a field
// and regular enough that wheel-driven depth selection stays predictable.
const RINGS = [
  { z: 4.2, radius: 5.2, y: 3.2, phase: 0.0 },
  { z: 1.9, radius: 6.4, y: 3.0, phase: 0.5 },
  { z: -0.4, radius: 6.8, y: 3.3, phase: 1.0 },
  { z: -2.7, radius: 6.0, y: 3.5, phase: 1.6 },
  { z: -5.0, radius: 4.8, y: 3.1, phase: 2.1 },
];

export const RING_Z = RINGS.map((ring) => ring.z);

export function layoutConstellation(artworks) {
  const total = artworks.length;
  const layers = Math.min(CFG.intro.layers, RINGS.length);
  artworks.forEach((art, i) => {
    const layer = i % layers;
    const slot = Math.floor(i / layers);
    const slotsInLayer = Math.ceil((total - layer) / layers);
    const ring = RINGS[layer];
    const angle = (slot / Math.max(1, slotsInLayer)) * Math.PI * 2 + ring.phase;
    const jitter = ((i * 37) % 11) / 11 - 0.5;

    art.layer = layer;
    art.base.set(
      Math.cos(angle) * ring.radius * 1.28,
      ring.y + Math.sin(angle) * ring.radius * 0.55,
      ring.z + jitter * 0.5
    );
    art.baseRotation.set(
      Math.sin(angle + 1.2) * 0.07,
      -Math.sin(angle) * 0.2,
      Math.sin(angle) * 0.03
    );
    art.bobPhase = (i * 1.7) % (Math.PI * 2);
    art.group.position.copy(art.base);
    art.group.rotation.copy(art.baseRotation);
  });
}
