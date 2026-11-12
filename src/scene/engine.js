import * as THREE from 'three';
import { CFG } from './config.js';
import { frameX } from './layout.js';
import { createArtwork, layoutConstellation, RING_Z } from './photos.js';
import { createParticleField } from './particles.js';
import { buildEnvironment } from './environment.js';
import { disposeFrameAssets } from './seigaiha.js';
import { loadGallery } from './data.js';

const clamp = THREE.MathUtils.clamp;
const damp = (k, dt) => 1 - Math.exp(-k * dt);

function wrap(index, count) {
  return ((index % count) + count) % count;
}

export class GalleryEngine {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.mode = 'loading';
    this.detail = false;
    this.index = 0;
    this.hovered = -1;
    this.focusLayer = Math.floor(CFG.intro.layers / 2);
    this.elapsed = 0;
    this.detailX = CFG.gallery.detailX;
    this.galleryDist = CFG.gallery.camZ;
    this.disposed = false;
    this.tweens = [];
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerDown = null;
    this.dragMode = null;
    this.raycaster = new THREE.Raycaster();
    this.lastTime = 0;
    this.desiredCam = new THREE.Vector3();
    this.desiredLook = new THREE.Vector3();
    this.hoverWorld = new THREE.Vector3();
    this.particleAccumulator = 0;
    this.lastParticleUpdate = 0;
    this.dprCap = Math.min(window.devicePixelRatio || 1, 1.75);
    this.dpr = this.dprCap;
    this.frameEma = 16;
    this.frameCounter = 0;
    this.scaleLockUntil = 0;

    this.onResize = this.onResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
    this.tick = this.tick.bind(this);
  }

  async init() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010207);
    this.scene.fog = new THREE.FogExp2(0x010207, 0.012);

    this.camera = new THREE.PerspectiveCamera(
      CFG.camera.fov,
      window.innerWidth / window.innerHeight,
      CFG.camera.near,
      CFG.camera.far
    );
    this.cameraTarget = new THREE.Vector3(0, CFG.intro.baseY, 0);
    this.camera.position.set(CFG.intro.camX, CFG.intro.camY, CFG.intro.zFront + CFG.intro.camDistance);

    this.scene.add(new THREE.AmbientLight(CFG.colors.ambient, CFG.lights.ambient));
    this.scene.add(
      new THREE.HemisphereLight(CFG.lights.hemiSky, CFG.lights.hemiGround, CFG.lights.hemi)
    );
    this.photoAmbient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.photoAmbient);

    this.particles = createParticleField(this.scene);

    this.handlers.onProgress?.(0.05);
    const items = await loadGallery();
    this.items = items;

    const loader = new THREE.TextureLoader();
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const textures = await Promise.all(
      items.map(async (item, i) => {
        const texture = await loader.loadAsync(item.thumbnail);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, maxAnisotropy);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        this.handlers.onProgress?.(0.05 + ((i + 1) / items.length) * 0.9);
        return texture;
      })
    );

    this.artworks = items.map((item, index) =>
      createArtwork({
        texture: textures[index],
        aspect: item.w / item.h,
        index,
        metadata: item,
      })
    );
    this.artworks.forEach((art) => this.scene.add(art.group));
    this.count = this.artworks.length;
    this.hitMeshes = this.artworks.map((art) => art.hitMesh);
    layoutConstellation(this.artworks);

    this.env = buildEnvironment(this.scene, this.count);
    this.updateViewMetrics();

    this.handlers.onReady?.(this.items);
    this.handlers.onProgress?.(1);
    this.mode = 'intro';
    this.handlers.onMode?.('intro');
    this.handlers.onLayer?.(this.focusLayer, CFG.intro.layers);
    this.applyHash();

    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(this.tick);
  }

  // ------------------------------------------------------------ public flow
  enter(index) {
    if (this.mode !== 'intro') return;
    const safe = clamp(Math.trunc(index), 0, this.count - 1);
    this.index = safe;
    this.mode = 'assembling';
    this.hovered = -1;
    this.handlers.onIndex?.(safe);
    this.handlers.onMode?.('assembling');

    const { stagger, photoDur, frameDur, frameDelay } = CFG.assembly;
    const particleOpacity = this.particles.pointMaterial.opacity;
    const lineOpacity = this.particles.lineMaterial.opacity;
    this.tween({
      duration: 1.1,
      onUpdate: (e) => {
        this.particles.pointMaterial.opacity = particleOpacity * (1 - e);
        this.particles.lineMaterial.opacity = lineOpacity * (1 - e);
      },
      onComplete: () => {
        this.particles.points.visible = false;
        this.particles.lines.visible = false;
      },
    });

    this.env.group.visible = true;
    this.env.spotlight.visible = true;
    this.env.fill.visible = true;
    const spotX = frameX(safe, this.count);
    this.env.spotlight.position.x = spotX;
    this.env.fill.position.x = spotX;
    this.env.spotTarget.position.x = spotX;

    let total = 0;
    this.artworks.forEach((art, i) => {
      art.tweenToken += 1;
      const token = art.tweenToken;
      const delay = i * stagger;
      const from = art.group.position.clone();
      const fromRot = art.group.rotation.clone();
      const fromScale = art.group.scale.x;
      const target = this.wallPosition(i);
      art.rotationTweening = true;
      art.mode = 'wall';
      art.group.visible = true;
      // The wall print is a different material from the floating card: the
      // garden dims cards through colour and emissive, and that state must
      // never leak onto the framed print.
      art.mesh.material = art.wallMaterial;
      art.material = art.wallMaterial;
      art.wallMaterial.color.setScalar(1);
      art.wallMaterial.emissiveIntensity = CFG.paper.galleryEmissive;
      this.tween({
        duration: photoDur,
        delay,
        ease: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        onUpdate: (e) => {
          if (token !== art.tweenToken) return;
          art.group.position.lerpVectors(from, target, e);
          art.group.rotation.set(fromRot.x * (1 - e), fromRot.y * (1 - e), fromRot.z * (1 - e));
          art.group.scale.setScalar(THREE.MathUtils.lerp(fromScale, 1, e));
        },
        onComplete: () => {
          if (token === art.tweenToken) art.rotationTweening = false;
        },
      });
      this.tween({
        duration: frameDur,
        delay: delay + frameDelay,
        ease: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
        onUpdate: (e) => {
          art.frame.visible = true;
          art.frame.scale.setScalar(Math.max(0.0001, e));
        },
      });
      total = Math.max(total, delay + photoDur);
    });

    const spotFrom = this.env.spotlight.intensity;
    const fillFrom = this.env.fill.intensity;
    this.tween({
      duration: 0.9,
      delay: 0.25,
      onUpdate: (e) => {
        this.env.spotlight.intensity = THREE.MathUtils.lerp(spotFrom, CFG.spotIntensity, e);
        this.env.fill.intensity = THREE.MathUtils.lerp(fillFrom, CFG.lights.fillIntensity, e);
        this.env.poolMat.opacity = CFG.pools.opacity * e;
        this.env.haloMat.opacity = CFG.pools.halo * e;
        this.env.canMat.emissiveIntensity = CFG.pools.canEmissive * e;
      },
    });

    this.tween({
      duration: Math.max(total, 1.15),
      onUpdate: () => {},
      onComplete: () => {
        this.mode = 'gallery';
        this.handlers.onMode?.('gallery');
      },
    });
  }

  focus(index) {
    if (this.mode !== 'gallery' || this.detail) return;
    this.detail = true;
    this.scaleLockUntil = performance.now() + 950;
    this.index = wrap(index, this.count);
    this.handlers.onIndex?.(this.index);
    this.handlers.onDetail?.(this.index);

    this.artworks.forEach((art, i) => {
      art.tweenToken += 1;
      const token = art.tweenToken;
      const selected = i === this.index;
      const from = art.group.position.clone();
      const fromScale = art.group.scale.x;
      const fromRotation = art.group.rotation.clone();
      const to = selected
        ? new THREE.Vector3(this.detailX, CFG.gallery.centerY, 0.02)
        : from.clone().setZ(from.z - 1.4);
      art.group.visible = true;
      art.rotationTweening = !selected;
      art.mode = selected ? 'detail' : 'hidden';
      this.tween({
        duration: selected ? 0.85 : 0.5,
        delay: selected ? 0.08 : (i % 4) * 0.03,
        onUpdate: (e) => {
          if (token !== art.tweenToken) return;
          art.group.position.lerpVectors(from, to, e);
          if (!selected) {
            art.group.rotation.set(fromRotation.x * (1 - e), fromRotation.y * (1 - e), 0);
          }
          art.group.scale.setScalar(
            THREE.MathUtils.lerp(fromScale, selected ? CFG.gallery.detailScale : 0.001, e)
          );
        },
        onComplete: () => {
          if (token !== art.tweenToken) return;
          art.rotationTweening = false;
          if (!selected) {
            art.group.visible = false;
            art.group.scale.setScalar(0.001);
          }
        },
      });
    });
  }

  closeDetail() {
    if (!this.detail) return;
    this.detail = false;
    this.scaleLockUntil = performance.now() + 650;
    this.handlers.onDetail?.(null);
    this.artworks.forEach((art, i) => {
      art.tweenToken += 1;
      const token = art.tweenToken;
      const from = art.group.position.clone();
      const fromScale = art.group.scale.x;
      const fromRotation = art.group.rotation.clone();
      const to = this.wallPosition(i);
      art.group.visible = true;
      art.rotationTweening = true;
      art.mode = 'wall';
      this.tween({
        duration: 0.55,
        onUpdate: (e) => {
          if (token !== art.tweenToken) return;
          art.group.position.lerpVectors(from, to, e);
          art.group.rotation.set(fromRotation.x * (1 - e), fromRotation.y * (1 - e), 0);
          art.group.scale.setScalar(THREE.MathUtils.lerp(fromScale, 1, e));
        },
        onComplete: () => {
          if (token === art.tweenToken) art.rotationTweening = false;
        },
      });
    });
  }

  exit() {
    if (this.mode !== 'gallery' && this.mode !== 'assembling') return;
    if (this.detail) {
      this.detail = false;
      this.handlers.onDetail?.(null);
    }
    this.mode = 'returning';
    this.hovered = -1;
    this.handlers.onMode?.('returning');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

    this.particles.points.visible = true;
    this.particles.lines.visible = true;
    const pointTarget = CFG.particles.opacity;
    const lineTarget = CFG.particles.linkOpacity;
    this.tween({
      duration: 1.2,
      delay: 0.15,
      onUpdate: (e) => {
        this.particles.pointMaterial.opacity = pointTarget * e;
        this.particles.lineMaterial.opacity = lineTarget * e;
      },
    });

    const { stagger, photoDur } = CFG.assembly;
    this.artworks.forEach((art, i) => {
      art.tweenToken += 1;
      const token = art.tweenToken;
      const from = art.group.position.clone();
      const fromRot = art.group.rotation.clone();
      const fromScale = art.group.scale.x;
      const to = art.base.clone();
      art.mode = 'intro';
      art.rotationTweening = false;
      art.group.visible = true;
      art.mesh.material = art.introMaterial;
      art.material = art.introMaterial;
      art.tint = 1;
      art.emissiveSmooth = CFG.paper.introEmissive;
      art.introMaterial.color.setScalar(1);
      art.introMaterial.emissiveIntensity = CFG.paper.introEmissive;
      art.uniformCurl.value.set(0, 0);
      art.dragVelocity.set(0, 0);

      this.tween({
        duration: photoDur,
        delay: i * stagger * 0.5,
        ease: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        onUpdate: (e) => {
          if (token !== art.tweenToken) return;
          art.group.position.lerpVectors(from, to, e);
          art.group.rotation.set(
            THREE.MathUtils.lerp(fromRot.x, art.baseRotation.x, e),
            THREE.MathUtils.lerp(fromRot.y, art.baseRotation.y, e),
            THREE.MathUtils.lerp(fromRot.z, art.baseRotation.z, e)
          );
          art.group.scale.setScalar(THREE.MathUtils.lerp(fromScale, 1, e));
        },
        onComplete: () => {
          if (token !== art.tweenToken) return;
          art.group.scale.setScalar(1);
        },
      });

      this.tween({
        duration: 0.45,
        delay: i * 0.02,
        onUpdate: (e) => {
          if (token !== art.tweenToken) return;
          art.frame.scale.setScalar(Math.max(0.0001, 1 - e));
        },
        onComplete: () => {
          art.frame.visible = false;
          art.frame.scale.setScalar(0.001);
        },
      });
    });

    const spotFrom = this.env.spotlight.intensity;
    const fillFrom = this.env.fill.intensity;
    const poolFrom = this.env.poolMat.opacity;
    const haloFrom = this.env.haloMat.opacity;
    this.tween({
      duration: 0.9,
      onUpdate: (e) => {
        this.env.spotlight.intensity = THREE.MathUtils.lerp(spotFrom, 0, e);
        this.env.fill.intensity = THREE.MathUtils.lerp(fillFrom, 0, e);
        this.env.poolMat.opacity = THREE.MathUtils.lerp(poolFrom, 0, e);
        this.env.haloMat.opacity = THREE.MathUtils.lerp(haloFrom, 0, e);
        this.env.canMat.emissiveIntensity = THREE.MathUtils.lerp(
          CFG.pools.canEmissive,
          0,
          e
        );
      },
    });

    this.tween({
      duration: photoDur + 0.35,
      onComplete: () => {
        this.env.group.visible = false;
        this.env.spotlight.visible = false;
        this.env.fill.visible = false;
        this.detail = false;
        this.mode = 'intro';
        this.handlers.onMode?.('intro');
        this.handlers.onLayer?.(this.focusLayer, CFG.intro.layers);
      },
    });
  }

  select(index) {
    if (this.mode !== 'gallery') return;
    if (this.detail) this.closeDetail();
    this.index = wrap(index, this.count);
    this.hovered = -1;
    this.handlers.onIndex?.(this.index);
  }

  next() {
    this.select(this.index + 1);
  }

  prev() {
    this.select(this.index - 1);
  }

  // Deep links: #/gallery opens the wall, #/photo/3 opens one artwork.
  applyHash() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw) return;
    const photo = /^photo\/(\d+)$/.exec(raw);
    if (photo) {
      const index = clamp(Number(photo[1]) - 1, 0, this.count - 1);
      this.enter(index);
      this.hashInterval = window.setInterval(() => {
        if (this.disposed) {
          window.clearInterval(this.hashInterval);
          return;
        }
        if (this.mode === 'gallery') {
          window.clearInterval(this.hashInterval);
          this.focus(index);
        }
      }, 140);
      this.hashTimer = window.setTimeout(() => window.clearInterval(this.hashInterval), 15000);
      return;
    }
    if (raw === 'gallery') this.enter(0);
  }

  // ------------------------------------------------------------ geometry
  wallPosition(i) {
    return new THREE.Vector3(frameX(i, this.count), CFG.gallery.centerY, 0);
  }

  layerZ(layer = this.focusLayer) {
    return RING_Z[layer] ?? RING_Z[RING_Z.length - 1];
  }

  updateViewMetrics() {
    const aspect = window.innerWidth / window.innerHeight;
    const tanHalfV = Math.tan(THREE.MathUtils.degToRad(CFG.camera.fov / 2));
    const tanHalfH = Math.max(0.2, tanHalfV * aspect);
    const neededHalfWidth = aspect < 1.1 ? 2.35 : 5.2;
    this.galleryDist = clamp(neededHalfWidth / tanHalfH, CFG.gallery.camZ, 20);
  }

  // ------------------------------------------------------------ loop
  tick() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.05);
    this.lastTime = now;
    this.elapsed += dt;

    this.updateTweens(dt);
    if (this.mode === 'intro') this.updateIntro(dt);
    else if (this.mode === 'gallery') this.updateGallery(dt);
    this.updateCamera(dt);
    this.updateDpr(dt);

    if (this.mode === 'intro' || this.mode === 'returning') {
      this.particleAccumulator += dt;
      if (this.particleAccumulator - this.lastParticleUpdate > 1 / 30) {
        this.particles.update(this.particleAccumulator - this.lastParticleUpdate);
        this.lastParticleUpdate = this.particleAccumulator;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateIntro(dt) {
    const kHover = damp(CFG.lerp.hoverK, dt);
    this.particles.pointMaterial.opacity = CFG.particles.opacity + Math.sin(this.elapsed * 1.2) * 0.06;

    for (const art of this.artworks) {
      art.hoverAmount = THREE.MathUtils.lerp(
        art.hoverAmount,
        art.index === this.hovered ? 1 : 0,
        kHover
      );
      const hover = art.hoverAmount;
      const selected = art.layer === this.focusLayer;
      const bob = Math.sin(this.elapsed * CFG.lerp.bobSpeed + art.bobPhase) * CFG.lerp.bobAmp;

      art.group.position.set(
        art.base.x,
        art.base.y + bob,
        art.base.z + hover * CFG.intro.hoverLift
      );

      art.dragRotation.x += art.dragVelocity.x * dt;
      art.dragRotation.y += art.dragVelocity.y * dt;
      art.dragVelocity.multiplyScalar(Math.exp(-CFG.intro.inertia * dt));

      // Hover tilt: the corner under the pointer leans toward the camera.
      // +rotation.x lifts the top edge forward, -rotation.y lifts the right edge.
      const tilt = hover * CFG.intro.hoverTilt;
      const tiltU = (art.tiltUv.x - 0.5) * 2;
      const tiltV = (art.tiltUv.y - 0.5) * 2;
      art.group.rotation.set(
        art.baseRotation.x + art.dragRotation.x + tiltV * tilt,
        art.baseRotation.y + art.dragRotation.y - tiltU * tilt,
        art.baseRotation.z
      );

      const targetScale = hover > 0.02 ? CFG.intro.hoverScale : selected ? 1 : 0.86;
      art.scaleSmooth = THREE.MathUtils.lerp(art.scaleSmooth, targetScale, kHover);
      art.group.scale.setScalar(art.scaleSmooth);

      art.uniformCurl.value.set(
        hover * this.pointer.x * CFG.intro.hoverCurl,
        hover * -this.pointer.y * CFG.intro.hoverCurl
      );

      const depthDim =
        art.layer < this.focusLayer ? CFG.paper.frontEmissive : CFG.paper.backEmissive;
      const targetEmissive =
        hover > 0.05
          ? CFG.paper.hoverEmissive
          : selected
            ? CFG.paper.introEmissive
            : depthDim;
      art.emissiveSmooth = THREE.MathUtils.lerp(art.emissiveSmooth, targetEmissive, kHover);
      art.material.emissiveIntensity = art.emissiveSmooth;

      // Diffuse tint fades foreground rings out of the way; emissive alone
      // cannot hide them because the fill light still lands on the print.
      const targetTint = hover > 0.05 || selected ? 1 : depthDim < 0.1 ? 0.05 : 0.42;
      art.tint = THREE.MathUtils.lerp(art.tint, targetTint, kHover);
      art.material.color.setScalar(art.tint);
    }
  }

  // Wall hover: the focused print comes forward just enough to read as
  // clickable, and the corner under the pointer leans toward the viewer.
  // Detail transitions own the scale, so only the tilt runs there.
  updateGallery(dt) {
    const k = damp(CFG.lerp.hoverK, dt);
    const tiltMax = this.detail ? CFG.gallery.detailTilt : CFG.gallery.hoverTilt;
    for (const art of this.artworks) {
      const active = this.detail ? art.index === this.index : true;
      const target = active && art.index === this.hovered ? 1 : 0;
      art.hoverAmount = THREE.MathUtils.lerp(art.hoverAmount, target, k);
      const tilt = art.hoverAmount * tiltMax;
      const tiltU = (art.tiltUv.x - 0.5) * 2;
      const tiltV = (art.tiltUv.y - 0.5) * 2;
      if (!art.rotationTweening) art.group.rotation.set(tiltV * tilt, -tiltU * tilt, 0);
      if (!this.detail && performance.now() > this.scaleLockUntil) {
        art.group.scale.setScalar(1 + CFG.gallery.hoverScale * art.hoverAmount);
      }
    }
  }

  // Portrait prints are narrow; on a phone the width-based wall distance would
  // leave them tiny. Fit the framed width instead, still showing the whole print.
  focusDistance() {
    const viewAspect = window.innerWidth / window.innerHeight;
    if (viewAspect >= 1.1) return this.galleryDist;
    const art = this.artworks?.[this.index];
    if (!art || art.aspect >= 0.9) return this.galleryDist;
    const tanHalfV = Math.tan(THREE.MathUtils.degToRad(CFG.camera.fov / 2));
    const tanHalfH = tanHalfV * viewAspect;
    const outerWidth = art.width + 0.9;
    return clamp(outerWidth / (2 * tanHalfH * CFG.gallery.portraitFit), 3.4, this.galleryDist);
  }

  updateCamera(dt) {
    const aspect = window.innerWidth / window.innerHeight;
    if (this.mode === 'intro' || this.mode === 'returning') {
      const layerZ = this.layerZ();
      const camY = CFG.intro.camY + this.pointer.y * CFG.intro.parallaxY;
      this.desiredCam.set(
        CFG.intro.camX + this.pointer.x * CFG.intro.parallaxX,
        camY,
        layerZ + CFG.intro.camDistance
      );
      this.desiredLook.set(this.pointer.x * 0.4, CFG.intro.baseY + this.pointer.y * 0.25, layerZ - 1.5);
      const k = damp(CFG.lerp.camIntroK, dt);
      this.camera.position.lerp(this.desiredCam, k);
      this.cameraTarget.lerp(this.desiredLook, k);
    } else {
      const wallX = frameX(this.index, this.count);
      const portrait = aspect < 1.1;
      // On a portrait screen the detail sheet covers the lower half, so the
      // camera aims below the print to lift it into the free space above.
      const wallDistance =
        this.detail || this.mode === 'assembling' ? this.galleryDist : this.focusDistance();
      const camX = this.detail ? (portrait ? this.detailX : this.detailX + 1.15) : wallX;
      const lookX = this.detail ? (portrait ? this.detailX : this.detailX + 2.25) : wallX;
      const lookY = this.detail && portrait ? CFG.gallery.centerY - 1.35 : CFG.gallery.centerY;
      const spread = portrait ? 0.1 : 0.25;
      this.desiredCam.set(
        camX + this.pointer.x * spread,
        CFG.gallery.centerY + this.pointer.y * 0.16,
        wallDistance
      );
      this.desiredLook.set(lookX, lookY, 0);
      const k = damp(this.mode === 'assembling' ? 2.2 : CFG.lerp.camGalleryK, dt);
      this.camera.position.lerp(this.desiredCam, k);
      this.cameraTarget.lerp(this.desiredLook, k);

      const spotX = this.detail ? this.detailX : wallX;
      const kSpot = damp(CFG.lerp.spotlightK, dt);
      this.env.spotlight.position.x = THREE.MathUtils.lerp(this.env.spotlight.position.x, spotX, kSpot);
      this.env.fill.position.x = this.env.spotlight.position.x;
      this.env.spotTarget.position.x = this.env.spotlight.position.x;
    }
    this.camera.lookAt(this.cameraTarget);
  }

  updateDpr(dt) {
    const ms = dt * 1000;
    this.frameEma = this.frameEma * 0.92 + ms * 0.08;
    this.frameCounter += 1;
    if (this.frameCounter % 90 !== 0) return;
    if (this.frameEma > 24 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    } else if (this.frameEma < 13 && this.dpr < this.dprCap) {
      this.dpr = Math.min(this.dprCap, this.dpr + 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }

  // ------------------------------------------------------------ pointer
  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = this.hitMeshes.filter((mesh) => mesh.parent.visible);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) return -1;
    // UV tells the hover pass which corner of the print the pointer is over,
    // which is what drives the tilt direction.
    const hit = hits[0];
    this.pickUv = hit.uv ?? null;
    return hit.object.userData.artworkIndex;
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    this.updatePointer(event);
    const picked = this.pick();
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
      index: picked,
    };
    if (this.mode === 'intro' && picked >= 0) {
      this.dragMode = 'rotate';
      this.dragTarget = this.artworks[picked];
      this.dragTarget.dragVelocity.set(0, 0);
    } else {
      this.dragMode = 'swipe';
    }
  }

  onPointerMove(event) {
    this.updatePointer(event);
    if (this.pointerDown) {
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (Math.hypot(dx, dy) > 6) this.pointerDown.moved = true;
      if (this.dragMode === 'rotate' && this.dragTarget) {
        this.dragTarget.dragVelocity.set(
          clamp(-dy * 0.0035, -0.5, 0.5),
          clamp(dx * 0.0035, -0.5, 0.5)
        );
        this.dragTarget.dragRotation.x += -dy * 0.0035;
        this.dragTarget.dragRotation.y += dx * 0.0035;
        this.dragTarget.dragRotation.x = clamp(this.dragTarget.dragRotation.x, -0.6, 0.6);
        this.dragTarget.dragRotation.y = clamp(this.dragTarget.dragRotation.y, -0.6, 0.6);
      }
      return;
    }
    if (this.mode === 'assembling') {
      this.canvas.style.cursor = 'default';
      return;
    }
    // Detail keeps hover alive so the focused print can tilt under the pointer.
    const picked = this.pick();
    this.hovered = picked;
    if (picked >= 0 && this.pickUv) {
      this.artworks[picked].tiltUv.copy(this.pickUv);
    }
    this.canvas.style.cursor = picked >= 0 ? 'pointer' : 'default';
  }

  onPointerUp(event) {
    if (!this.pointerDown) return;
    const { moved, x, y, index } = this.pointerDown;
    const dx = event.clientX - x;
    this.pointerDown = null;
    const dragMode = this.dragMode;
    this.dragMode = null;
    this.dragTarget = null;

    if (!moved) {
      if (dragMode === 'swipe' && this.mode === 'gallery') {
        if (index >= 0) {
          if (this.detail) {
            this.closeDetail();
          } else {
            this.focus(index);
          }
        } else if (this.detail) {
          this.closeDetail();
        }
      } else if (this.mode === 'intro' && index >= 0) {
        this.enter(index);
      }
      return;
    }

    if (this.mode === 'gallery' && Math.abs(dx) > 55) {
      if (dx > 0) this.next();
      else this.prev();
    }
  }

  onPointerLeave() {
    if (!this.pointerDown) {
      this.hovered = -1;
      this.canvas.style.cursor = 'default';
    }
  }

  onWheel(event) {
    if (this.mode !== 'intro') return;
    if (Math.abs(event.deltaY) < 2) return;
    const next = clamp(
      this.focusLayer + Math.sign(event.deltaY),
      0,
      CFG.intro.layers - 1
    );
    if (next !== this.focusLayer) {
      this.focusLayer = next;
      this.handlers.onLayer?.(next, CFG.intro.layers);
    }
  }

  onKeyDown(event) {
    if (event.key === 'Escape' && this.detail) {
      this.closeDetail();
      return;
    }
    if (this.mode !== 'gallery') return;
    if (event.key === 'ArrowRight' || event.key === 'd') this.next();
    else if (event.key === 'ArrowLeft' || event.key === 'a') this.prev();
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateViewMetrics();
  }

  onVisibility() {
    // Resume from the current timestamp so a backgrounded tab does not
    // deliver one huge delta.
    if (!document.hidden) this.lastTime = performance.now();
  }

  // ------------------------------------------------------------ tweens
  tween({ duration = 0.6, delay = 0, ease = (t) => 1 - Math.pow(1 - t, 3), onUpdate, onComplete }) {
    const tw = { duration, delay, ease, onUpdate, onComplete, elapsed: 0 };
    this.tweens.push(tw);
    return tw;
  }

  updateTweens(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.elapsed += dt;
      if (tw.elapsed < tw.delay) continue;
      const raw = tw.duration <= 0 ? 1 : Math.min(1, (tw.elapsed - tw.delay) / tw.duration);
      tw.onUpdate?.(tw.ease(raw));
      if (raw >= 1) {
        tw.onComplete?.();
        this.tweens.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ teardown
  dispose() {
    this.disposed = true;
    window.clearTimeout(this.hashTimer);
    window.clearInterval(this.hashInterval);
    this.renderer?.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibility);

    this.scene?.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          material.map?.dispose();
          material.emissiveMap?.dispose();
          material.dispose();
        });
      }
    });
    this.artworks?.forEach((art) => {
      art.introMaterial.map?.dispose();
      art.introMaterial.dispose();
      art.wallMaterial.dispose();
    });
    this.particles?.dispose();
    disposeFrameAssets();
    this.renderer?.dispose();
    this.items = null;
    this.artworks = null;
  }
}
