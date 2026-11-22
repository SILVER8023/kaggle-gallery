// Central tunables for the deep-space gallery.
export const CFG = {
  camera: { fov: 52, near: 0.1, far: 260 },

  photo: {
    baseH: 1.7, // world-space height of every photo
    radius: 0.1, // rounded-card corner radius in deep space
    segments: 10, // paper bend resolution
  },

  seigaiha: {
    margin: 0.26,
    border: 0.19,
    boardColor: 0xf6f1e7,
    backing: 0x201409,
  },

  gallery: {
    spacing: 4.6,
    centerY: 2.3,
    camZ: 7.4,
    floorY: 0,
    spotY: 7.6,
    spotZ: 1.2,
    wallZ: -0.9,
    detailX: -2.0,
    detailScale: 1.9, // 2026-11-22 用户要求：画廊视图中央画幅放大到红框尺寸（约 550px 高），由 1.22 调大
    hoverScale: 0.05, // wall print grows slightly under the pointer
    hoverTilt: 0.3, // radians; wall print leans toward the pointer corner
    detailTilt: 0.32, // radians; same effect on the focused print
    portraitFit: 0.82, // mobile safe width fraction for a portrait print
  },

  intro: {
    layers: 5,
    baseY: 3.2,
    zFront: 5.5,
    camDistance: 14.0,
    camY: 3.2,
    camX: 0,
    hoverLift: 0.38,
    hoverCurl: 0.38,
    hoverTilt: 0.3, // radians; the corner under the pointer leans toward the viewer
    hoverScale: 1.08,
    parallaxX: 0.35,
    parallaxY: 0.2,
    dragRotate: 0.9,
    inertia: 3.2,
  },

  paper: {
    introEmissive: 1.0,
    dimEmissive: 0.28,
    frontEmissive: 0.05,
    backEmissive: 0.22,
    hoverEmissive: 1.3,
    galleryEmissive: 1.0,
    roughness: 0.78,
    clearcoat: 0.22,
  },

  colors: {
    wall: 0x070708,
    floor: 0x050506,
    spot: 0xfff8ef,
    ambient: 0x8f8f9c,
    star: 0xbfd2ea,
    line: 0x6f9bd6,
  },

  lights: {
    ambient: 0.12,
    hemiSky: 0xfff5e8,
    hemiGround: 0x100d0b,
    hemi: 0.16,
    spotAngle: 0.66,
    spotPenumbra: 0.8,
    spotDecay: 1.3,
    spotDistance: 20,
    fillIntensity: 5,
    fillAngle: 1.05,
  },

  pools: { opacity: 0.16, halo: 0.12, canEmissive: 0.7 },
  spotIntensity: 52,

  particles: {
    count: 110,
    size: 0.26,
    opacity: 0.7,
    linkOpacity: 0.14,
    linkDistance: 9.5,
    maxLinks: 4,
    bounds: { x: 58, yMin: -12, yMax: 34, zMin: -64, zMax: -18 },
  },

  lerp: {
    camIntroK: 3.0,
    camGalleryK: 2.6,
    hoverK: 8,
    bobSpeed: 0.5,
    bobAmp: 0.14,
    spotlightK: 4.2,
  },

  assembly: { stagger: 0.05, photoDur: 0.85, frameDur: 0.55, frameDelay: 0.18 },
};
