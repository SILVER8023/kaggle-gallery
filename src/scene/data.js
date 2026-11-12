const ASSET_BASE = `${import.meta.env.BASE_URL}assets/thumbs/`;
const MANIFEST_URL = `${ASSET_BASE}manifest.json`;
const OVERRIDES_URL = `${ASSET_BASE}artworks.json`;

async function fetchJson(url, optional = false) {
  const response = await fetch(url, { cache: 'no-cache' });
  const type = response.headers.get('content-type') ?? '';
  // Vite's SPA fallback answers unknown paths with index.html and status 200,
  // so a missing optional file is detected by content type rather than status.
  if (!response.ok || !type.includes('application/json')) {
    if (optional) return null;
    throw new Error(`${url} 未返回 JSON（${response.status} ${type || 'unknown'}）`);
  }
  return response.json();
}

function formatCamera(meta) {
  if (meta.camera) return meta.camera;
  const parts = [];
  if (meta.make || meta.model) {
    const body = [meta.make, meta.model].filter(Boolean).join(' ');
    const redundant =
      meta.make && meta.model && meta.model.toLowerCase().startsWith(meta.make.toLowerCase());
    parts.push(redundant ? meta.model : body);
  }
  if (meta.focalLength) parts.push(`${meta.focalLength}mm`);
  if (meta.fNumber) parts.push(`f/${meta.fNumber}`);
  if (meta.exposure) parts.push(`${meta.exposure}s`);
  if (meta.iso) parts.push(`ISO ${meta.iso}`);
  return parts.length ? parts.join(' · ') : '';
}

export async function loadGallery(onProgress = () => {}) {
  const manifest = await fetchJson(MANIFEST_URL);
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('照片清单为空，请检查 assets/thumbs/manifest.json。');
  }

  const catalog = await fetchJson(OVERRIDES_URL);
  const overrides = catalog?.artworks;
  if (!overrides || manifest.some((item) => !overrides[item.src])) {
    throw new Error('作品资料与照片清单不匹配，请重新运行缩略图生成脚本。');
  }

  return manifest.map((item, index) => {
    const extra = overrides[item.src];
    return {
      ...item,
      index,
      title: extra.title || item.description || '',
      description: extra.description || '',
      rationale: extra.rationale || '',
      author: extra.author || item.author || '',
      date: extra.date || item.date || '',
      camera: formatCamera(extra.camera ? { camera: extra.camera } : item),
      source: item.src ?? item.thumb,
      thumbnail: `${ASSET_BASE}${item.thumb}`,
      onProgress,
    };
  });
}
