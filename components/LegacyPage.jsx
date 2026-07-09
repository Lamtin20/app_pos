'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Loads legacy HTML into the DOM and executes scripts after injection.
 * Fixes POS boot: scripts run after window "load" has already fired.
 */
export default function LegacyPage({ src, title }) {
  const hostRef = useRef(null);
  const [loading, setLoading] = useState(true);
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

    async function runInlineScripts(scripts) {
      for (const s of scripts) {
        const key = s.textContent.slice(0, 80);
        if (!window.__SUN_LEGACY_INLINE__) window.__SUN_LEGACY_INLINE__ = new Set();
        if (window.__SUN_LEGACY_INLINE__.has(key)) continue;
        window.__SUN_LEGACY_INLINE__.add(key);
        const el = document.createElement('script');
        el.textContent = s.textContent;
        document.body.appendChild(el);
      }
    }

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(src, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        if (cancelled || !hostRef.current) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        doc.querySelectorAll('head link[rel="stylesheet"], head style').forEach((node) => {
          document.head.appendChild(node.cloneNode(true));
        });

        hostRef.current.innerHTML = doc.body.innerHTML;

        const scriptSrcs = [];
        const seenSrc = new Set();
        doc.querySelectorAll('head script[src], body script[src]').forEach((node) => {
          const src = node.getAttribute('src');
          if (!src || seenSrc.has(src)) return;
          seenSrc.add(src);
          scriptSrcs.push(src);
        });
        if (!seenSrc.has('/sun-api-client.js')) {
          scriptSrcs.unshift('/sun-api-client.js');
        }
        for (const src of scriptSrcs) {
          await loadScript(src);
        }

        const inlineScripts = [...doc.querySelectorAll('script:not([src])')];
        await runInlineScripts(inlineScripts);

        if (typeof window.__SUN_POS_BOOT__ === 'function') {
          window.__SUN_POS_BOOT__();
        }

        if (title) document.title = title;
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
    };
  }, [src, title]);

  return (
    <>
      {loading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg,#FAF6F0 0%,#F0E8DE 100%)',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: '4px solid rgba(154,52,18,.15)',
              borderTopColor: '#9A3412',
              borderRadius: '50%',
              animation: 'sun-spin 0.8s linear infinite',
            }}
          />
          <p style={{ margin: 0, fontWeight: 700, color: '#7C2D12', fontSize: 14 }}>
            Đang tải SUN Nut Milk…
          </p>
          <style>{'@keyframes sun-spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}
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
