'use client';

import { useEffect, useRef, useState } from 'react';

function SunBootLoader({ progress }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className="sun-boot-loader" role="status" aria-live="polite" aria-label={`Đang tải ${pct}%`}>
      <div className="sun-boot-cup-scene">
        <div className="sun-boot-steam" aria-hidden="true">
          <span className="sun-boot-steam-line s1" />
          <span className="sun-boot-steam-line s2" />
          <span className="sun-boot-steam-line s3" />
        </div>
        <div className="sun-boot-cup" aria-hidden="true">
          <div className="sun-boot-cup-rim" />
          <div className="sun-boot-cup-inner">
            <div className="sun-boot-coffee-surface" />
            <div className="sun-boot-coffee-shine" />
          </div>
          <div className="sun-boot-cup-body" />
          <div className="sun-boot-cup-handle" />
          <div className="sun-boot-saucer" />
        </div>
      </div>

      <div className="sun-boot-progress-wrap">
        <div className="sun-boot-track">
          <div className="sun-boot-fill" style={{ width: `${pct}%` }} />
          <div className="sun-boot-sun-marker" style={{ left: `calc(${pct}% - 15px)` }}>
            <svg className="sun-boot-sun-icon" viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="16" r="6.5" fill="#FBBF24" />
              <g stroke="#F59E0B" strokeWidth="2" strokeLinecap="round">
                <line x1="16" y1="3" x2="16" y2="7" />
                <line x1="16" y1="25" x2="16" y2="29" />
                <line x1="3" y1="16" x2="7" y2="16" />
                <line x1="25" y1="16" x2="29" y2="16" />
                <line x1="6.8" y1="6.8" x2="9.6" y2="9.6" />
                <line x1="22.4" y1="22.4" x2="25.2" y2="25.2" />
                <line x1="6.8" y1="25.2" x2="9.6" y2="22.4" />
                <line x1="22.4" y1="9.6" x2="25.2" y2="6.8" />
              </g>
            </svg>
          </div>
        </div>
        <div className="sun-boot-pct-row">
          <span className="sun-boot-pct-label">Đang tải trang</span>
          <span className="sun-boot-pct-num">{pct}%</span>
        </div>
      </div>

      <style>{`
        .sun-boot-loader {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 28px;
          padding: 24px;
          background:
            radial-gradient(ellipse 80% 50% at 50% 100%, rgba(251, 191, 36, 0.12), transparent 70%),
            linear-gradient(165deg, #FDF8F3 0%, #F5EBE0 45%, #EDE0D4 100%);
        }
        .sun-boot-cup-scene {
          position: relative;
          width: 120px;
          height: 130px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .sun-boot-steam {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 72px;
          height: 48px;
          display: flex;
          justify-content: center;
          gap: 10px;
          pointer-events: none;
        }
        .sun-boot-steam-line {
          display: block;
          width: 8px;
          height: 36px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.75) 35%, rgba(255,255,255,0) 100%);
          filter: blur(0.5px);
          opacity: 0;
          animation: sun-steam-rise 2.2s ease-in-out infinite;
        }
        .sun-boot-steam-line.s1 { animation-delay: 0s; margin-top: 4px; height: 32px; }
        .sun-boot-steam-line.s2 { animation-delay: 0.55s; height: 40px; }
        .sun-boot-steam-line.s3 { animation-delay: 1.1s; margin-top: 6px; height: 28px; }
        @keyframes sun-steam-rise {
          0% { opacity: 0; transform: translateY(12px) scaleX(0.7); }
          25% { opacity: 0.85; }
          100% { opacity: 0; transform: translateY(-28px) scaleX(1.15); }
        }
        .sun-boot-cup {
          position: relative;
          width: 88px;
          height: 72px;
        }
        .sun-boot-cup-rim {
          position: absolute;
          top: 0;
          left: 4px;
          right: 18px;
          height: 10px;
          border-radius: 4px 4px 2px 2px;
          background: linear-gradient(180deg, #F5F5F4, #D6D3D1);
          box-shadow: inset 0 -2px 0 rgba(0,0,0,0.06);
          z-index: 4;
        }
        .sun-boot-cup-inner {
          position: absolute;
          top: 8px;
          left: 8px;
          right: 22px;
          height: 14px;
          border-radius: 0 0 6px 6px;
          overflow: hidden;
          z-index: 3;
        }
        .sun-boot-coffee-surface {
          height: 100%;
          background: linear-gradient(180deg, #92400E 0%, #78350F 100%);
        }
        .sun-boot-coffee-shine {
          position: absolute;
          top: 2px;
          left: 8px;
          width: 28px;
          height: 4px;
          border-radius: 999px;
          background: rgba(255,255,255,0.25);
        }
        .sun-boot-cup-body {
          position: absolute;
          top: 10px;
          left: 0;
          width: 70px;
          height: 58px;
          border-radius: 0 0 14px 14px;
          background: linear-gradient(135deg, #FAFAF9 0%, #E7E5E4 55%, #D6D3D1 100%);
          box-shadow:
            inset -4px -6px 12px rgba(0,0,0,0.08),
            inset 3px 3px 8px rgba(255,255,255,0.9),
            0 10px 24px rgba(124, 45, 18, 0.15);
          z-index: 2;
        }
        .sun-boot-cup-handle {
          position: absolute;
          top: 22px;
          right: -2px;
          width: 22px;
          height: 34px;
          border: 5px solid #D6D3D1;
          border-left: none;
          border-radius: 0 14px 14px 0;
          box-shadow: 2px 2px 0 rgba(255,255,255,0.5);
          z-index: 1;
        }
        .sun-boot-saucer {
          position: absolute;
          bottom: -8px;
          left: -8px;
          width: 96px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(180deg, #F5F5F4, #D6D3D1);
          box-shadow: 0 4px 12px rgba(124, 45, 18, 0.12);
          z-index: 0;
        }
        .sun-boot-progress-wrap {
          width: min(280px, 86vw);
        }
        .sun-boot-track {
          position: relative;
          height: 12px;
          border-radius: 999px;
          background: rgba(154, 52, 18, 0.1);
          box-shadow: inset 0 1px 3px rgba(124, 45, 18, 0.12);
          overflow: visible;
        }
        .sun-boot-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #EA580C, #F59E0B, #FBBF24);
          box-shadow: 0 0 12px rgba(251, 191, 36, 0.45);
          transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .sun-boot-sun-marker {
          position: absolute;
          top: 50%;
          width: 30px;
          height: 30px;
          transform: translateY(-50%);
          transition: left 0.35s cubic-bezier(0.22, 1, 0.36, 1);
          filter: drop-shadow(0 2px 6px rgba(245, 158, 11, 0.55));
          animation: sun-icon-pulse 1.6s ease-in-out infinite;
        }
        .sun-boot-sun-icon {
          width: 30px;
          height: 30px;
          animation: sun-icon-spin 4s linear infinite;
        }
        @keyframes sun-icon-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sun-icon-pulse {
          0%, 100% { transform: translateY(-50%) scale(1); }
          50% { transform: translateY(-50%) scale(1.08); }
        }
        .sun-boot-pct-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 10px;
          padding: 0 2px;
        }
        .sun-boot-pct-label {
          font-size: 13px;
          font-weight: 600;
          color: #9A3412;
          opacity: 0.85;
          letter-spacing: 0.02em;
        }
        .sun-boot-pct-num {
          font-size: 15px;
          font-weight: 800;
          color: #7C2D12;
          font-variant-numeric: tabular-nums;
          min-width: 3ch;
          text-align: right;
        }
      `}</style>
    </div>
  );
}

/**
 * Loads legacy HTML into the DOM and executes scripts after injection.
 * Fixes POS boot: scripts run after window "load" has already fired.
 */
export default function LegacyPage({ src, title }) {
  const hostRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadScript(srcUrl) {
      await new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = srcUrl;
        el.onload = resolve;
        el.onerror = () => reject(new Error('Không tải script: ' + srcUrl));
        document.body.appendChild(el);
      });
    }

    async function runInlineScripts(scripts, pageSrc) {
      for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i];
        const el = document.createElement('script');
        el.setAttribute('data-sun-legacy-src', pageSrc);
        el.setAttribute('data-sun-legacy-idx', String(i));
        el.textContent = s.textContent;
        document.body.appendChild(el);
      }
    }

    async function load() {
      setLoading(true);
      setProgress(0);
      setError('');
      try {
        setProgress(8);
        const res = await fetch(src, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setProgress(22);
        const html = await res.text();
        if (cancelled || !hostRef.current) return;

        setProgress(32);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        doc.querySelectorAll('head link[rel="stylesheet"], head style').forEach((node) => {
          document.head.appendChild(node.cloneNode(true));
        });

        hostRef.current.innerHTML = doc.body.innerHTML;
        setProgress(42);

        const scriptSrcs = [];
        const seenSrc = new Set();
        doc.querySelectorAll('head script[src], body script[src]').forEach((node) => {
          const scriptSrc = node.getAttribute('src');
          if (!scriptSrc || seenSrc.has(scriptSrc)) return;
          seenSrc.add(scriptSrc);
          scriptSrcs.push(scriptSrc);
        });
        if (!seenSrc.has('/sun-api-client.js')) {
          scriptSrcs.unshift('/sun-api-client.js');
        }

        const scriptBase = 42;
        const scriptSpan = 46;
        for (let i = 0; i < scriptSrcs.length; i++) {
          await loadScript(scriptSrcs[i]);
          if (cancelled) return;
          setProgress(scriptBase + Math.round(((i + 1) / scriptSrcs.length) * scriptSpan));
        }

        setProgress(92);
        const inlineScripts = [...doc.querySelectorAll('script:not([src])')];
        await runInlineScripts(inlineScripts, src);

        setProgress(96);
        if (typeof window.__SUN_POS_BOOT__ === 'function') {
          window.__SUN_POS_BOOT__();
        }
        if (src.includes('admin.html') && typeof window.loadSiteBrandForAdmin === 'function') {
          try { window.loadSiteBrandForAdmin(); } catch (eBrand) { /* ignore */ }
        }

        setProgress(100);
        if (title) document.title = title;

        await new Promise((r) => setTimeout(r, 280));
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Không tải được trang');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      document.querySelectorAll('script[data-sun-legacy-src="' + src + '"]').forEach((node) => {
        node.remove();
      });
    };
  }, [src, title]);

  return (
    <>
      {loading && <SunBootLoader progress={progress} />}
      {error && (
        <div style={{ padding: 24, textAlign: 'center', color: '#B91C1C', fontWeight: 700 }}>
          {error}
        </div>
      )}
      <div
        ref={hostRef}
        className="legacy-page-root"
        style={{
          minHeight: '100dvh',
          height: '100dvh',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      />
    </>
  );
}
