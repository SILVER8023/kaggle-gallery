import { useCallback, useEffect, useRef, useState } from 'react';
import { GalleryEngine } from './scene/engine.js';
import { AUTHOR, PROJECT, WORK } from './data/author.js';

const titleOf = (item, index) =>
  item?.title?.trim() || `无题 · 第 ${String(index + 1).padStart(2, '0')} 幅`;

const MODE_HINT = {
  intro: '滚轮切换纵深 · 悬停点亮 · 拖动旋转 · 点击进入画廊',
  assembling: '正在布展…',
  gallery: '点击作品查看档案 · ← → 切换',
  returning: '返回深空…',
};

function InfoRow({ label, value, mono = false }) {
  const empty = !value;
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd data-empty={empty || undefined} className={mono ? 'is-mono' : undefined}>
        {empty ? '未提供' : value}
      </dd>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [mode, setMode] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState(null);
  const [layer, setLayer] = useState(2);
  const [layers, setLayers] = useState(5);
  const [error, setError] = useState('');
  const [about, setAbout] = useState(null);
  const aboutCloseRef = useRef(null);
  const aboutTriggerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = new GalleryEngine(canvas, {
      onProgress: (value) => setProgress(value),
      onReady: (list) => setItems(list),
      onMode: (value) => setMode(value),
      onIndex: (value) => setIndex(value),
      onDetail: (value) => setDetail(value),
      onLayer: (value, total) => {
        setLayer(value);
        setLayers(total);
      },
    });
    engineRef.current = engine;
    if (import.meta.env.DEV) window.__gallery = engine;
    engine.init().catch((reason) => {
      console.error(reason);
      setError(reason instanceof Error ? reason.message : String(reason));
      setMode('error');
    });
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const goNext = useCallback(() => engineRef.current?.next(), []);
  const goHome = useCallback(() => engineRef.current?.exit(), []);
  const goPrev = useCallback(() => engineRef.current?.prev(), []);
  const closeDetail = useCallback(() => engineRef.current?.closeDetail(), []);

  const openAbout = (kind, event) => {
    aboutTriggerRef.current = event.currentTarget;
    setAbout(kind);
  };

  const closeAbout = () => {
    setAbout(null);
    requestAnimationFrame(() => aboutTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!about) return undefined;
    aboutCloseRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeAbout();
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'a' || event.key === 'd') {
        event.stopImmediatePropagation();
      }
      if (event.key === 'Tab') {
        const focusable = [...document.querySelectorAll('.about-card button, .about-card a')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [about]);

  const loading = mode === 'loading';
  const showInfo = detail !== null && items[detail];
  const active = items[detail ?? index];
  const total = items.length;

  return (
    <div className="app" data-mode={mode} data-detail={detail !== null ? 'on' : 'off'}>
      <canvas ref={canvasRef} className="stage" aria-label="深空画廊 3D 场景" />

      <div className="depth-blur" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <header className="brand">
        <p className="brand-kicker">Deep Space Gallery</p>
        <h1 className="brand-title">深空画廊</h1>
        <p className="brand-sub">{total ? `影像 · ${total} 帧` : '影像收藏'}</p>
        <div className="brand-links">
          <button type="button" className="brand-link" onClick={(event) => openAbout('author', event)}>
            关于作者
          </button>
          <button type="button" className="brand-link" onClick={(event) => openAbout('work', event)}>
            关于作品
          </button>
        </div>
      </header>

      {!loading && mode !== 'error' && (
        <p className="hint" data-detail={detail !== null || undefined}>
          {detail !== null ? 'Esc 或点击空白处返回画廊' : MODE_HINT[mode] ?? ''}
        </p>
      )}

      {mode === 'intro' && (
        <div className="depth-meter" aria-label={`纵深 ${layer + 1} / ${layers}`}>
          <span className="depth-label">纵深</span>
          {Array.from({ length: layers }, (_, i) => (
            <i key={i} data-active={i === layer || undefined} />
          ))}
        </div>
      )}

      {(mode === 'gallery' || mode === 'assembling') && (
        <button type="button" className="home" onClick={goHome}>
          <span aria-hidden="true">←</span> 首页
        </button>
      )}

      {mode !== 'intro' && total > 0 && (
        <div className="counter" aria-live="polite">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <em>/</em>
          <span>{String(total).padStart(2, '0')}</span>
        </div>
      )}

      {mode !== 'intro' && !showInfo && (
        <nav className="nav" aria-label="作品切换">
          <button type="button" onClick={goPrev} aria-label="上一幅">
            ←
          </button>
          <button type="button" onClick={goNext} aria-label="下一幅">
            →
          </button>
        </nav>
      )}

      <aside className="info" data-open={showInfo ? 'on' : 'off'} aria-hidden={!showInfo}>
        {showInfo && (
          <>
            <button type="button" className="info-close" onClick={closeDetail} aria-label="返回画廊">
              ×
            </button>
            <p className="info-index">
              No.{String(detail + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </p>
            <h2 className="info-title">{titleOf(active, detail)}</h2>
            {active.description ? (
              <p className="info-desc">{active.description}</p>
            ) : (
              <p className="info-desc" data-empty="true">
                这幅作品还没有写下简介。
              </p>
            )}
            {active.rationale && (
              <section className="info-rationale" aria-label="命名缘由">
                <h3>命名缘由</h3>
                <p>{active.rationale}</p>
              </section>
            )}
            <dl className="info-meta">
              <InfoRow label="作者" value={active.author} />
              <InfoRow label="拍摄日期" value={active.date} />
              <InfoRow label="拍摄参数" value={active.camera} />
              <InfoRow label="原始文件" value={active.source} mono />
            </dl>
            <p className="info-foot">点击空白处返回 · Esc</p>
          </>
        )}
      </aside>

      {mode !== 'intro' && !showInfo && active?.title && (
        <div className="filmstrip" aria-hidden="true">
          <span>{active.title}</span>
        </div>
      )}

      {loading && (
        <div className="loader" role="status">
          <div className="loader-inner">
            <p className="loader-title">正在布置画廊</p>
            <div className="loader-track">
              <i style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} />
            </div>
            <p className="loader-value">{Math.round(progress * 100)}%</p>
          </div>
        </div>
      )}

      {about && (
        <div className="about" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <button type="button" className="about-backdrop" onClick={closeAbout} aria-label="关闭弹窗" tabIndex={-1} />
          <div className="about-card" data-kind={about}>
            <button type="button" ref={aboutCloseRef} className="about-close" onClick={closeAbout} aria-label="关闭弹窗">
              ×
            </button>
            {about === 'author' ? (
              <>
                <img className="about-avatar" src={AUTHOR.avatar} alt={AUTHOR.name} loading="lazy" />
                <p className="about-kicker">Project author</p>
                <h2 className="about-name" id="about-title">
                  {AUTHOR.name}<span className="about-journal">{AUTHOR.journal}</span>
                </h2>
                <p className="about-bio">{AUTHOR.bio}</p>
                <p className="about-meta">{AUTHOR.location} · @{AUTHOR.login}</p>
                <div className="about-project">
                  <h3>{PROJECT.name}</h3>
                  <p>{PROJECT.summary}</p>
                  <p className="about-stack">{PROJECT.stack}</p>
                </div>
                <a className="about-link" href={AUTHOR.github} target="_blank" rel="noreferrer">
                  在 GitHub 上查看 @{AUTHOR.login}
                </a>
              </>
            ) : (
              <>
                <p className="about-kicker">About the work</p>
                <h2 className="about-name" id="about-title">{WORK.title}</h2>
                <div className="about-essay">
                  {WORK.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mode === 'error' && (
        <div className="error" role="alert">
          <h2>场景未能启动</h2>
          <p>{error || '请确认本地服务已启动，然后刷新页面。'}</p>
          <p className="error-hint">在项目根目录运行：npm run dev</p>
        </div>
      )}
    </div>
  );
}
