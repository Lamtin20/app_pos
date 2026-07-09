'use client';

import { useEffect, useRef } from 'react';

/**
 * Loads a pre-built legacy HTML page from /legacy/*.html into the DOM.
 * Scripts are re-executed via manual injection (innerHTML does not run scripts).
 */
export default function LegacyPage({ src, title }) {
  const hostRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(src, { cache: 'no-store' });
      const html = await res.text();
      if (cancelled || !hostRef.current) return;

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Copy styles from legacy head
      doc.querySelectorAll('head link[rel="stylesheet"], head style').forEach((node) => {
        document.head.appendChild(node.cloneNode(true));
      });

      // Body content
      hostRef.current.innerHTML = doc.body.innerHTML;

      // External scripts first (sun-api-client)
      const extScripts = [...doc.querySelectorAll('script[src]')];
      for (const s of extScripts) {
        await new Promise((resolve, reject) => {
          const el = document.createElement('script');
          el.src = s.getAttribute('src');
          el.onload = resolve;
          el.onerror = reject;
          document.body.appendChild(el);
        });
      }

      // Inline scripts in order
      doc.querySelectorAll('script:not([src])').forEach((s) => {
        const el = document.createElement('script');
        el.textContent = s.textContent;
        document.body.appendChild(el);
      });

      if (title) document.title = title;
    }

    load().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [src, title]);

  return (
    <div
      ref={hostRef}
      className="legacy-page-root"
      style={{ minHeight: '100vh', width: '100%' }}
    />
  );
}
