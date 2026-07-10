'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SetupPanel, { SetupButton } from '../components/SetupPanel.jsx';

const DEFAULT_BRAND = {
  brandName: 'SUN Nut Milk',
  brandTagline: 'Tinh hoa từ hạt — hệ thống bán hàng trên Vercel + Google Sheets',
  logoUrl: 'https://i.ibb.co/8LV0snn8/logo-sun-web.png',
  faviconUrl: 'https://i.ibb.co/8LV0snn8/logo-sun-web.png',
};

const PORTALS = [
  {
    href: '/order',
    icon: '🛒',
    title: 'POS — Bán hàng tại quầy',
    desc: 'Thu ngân, in bill, quản lý đơn tại quầy',
    accent: 'portal-pos',
  },
  {
    href: '/member',
    icon: '👤',
    title: 'Cổng hội viên',
    desc: 'Đặt sữa hạt, ưu đãi, gói giao & tích Sun',
    accent: 'portal-member',
  },
  {
    href: '/admin',
    icon: '🔐',
    title: 'Quản trị (Admin)',
    desc: 'Doanh thu, kho, menu, thành viên & CMS',
    accent: 'portal-admin',
  },
];

function applyFavicon(url) {
  if (typeof document === 'undefined' || !url) return;
  ['icon', 'apple-touch-icon'].forEach((rel) => {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = url;
  });
}

export default function HomePage() {
  const [setupOpen, setSetupOpen] = useState(false);
  const [brand, setBrand] = useState(DEFAULT_BRAND);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.search.includes('setup=1')) {
      setSetupOpen(true);
    }
    fetch('/api/brand', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const b = data?.brand || data;
        if (b && b.brandName) {
          setBrand({ ...DEFAULT_BRAND, ...b });
          applyFavicon(b.faviconUrl || b.logoUrl);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <main className="home-portal">
      <div className="home-portal-bg" aria-hidden="true" />
      <div className="home-portal-inner">
        <header className="home-portal-header">
          <div className="home-brand-lockup">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="" className="home-brand-logo" />
            ) : (
              <span className="home-brand-logo-fallback">🌰</span>
            )}
            <div>
              <h1>{brand.brandName}</h1>
              <p className="home-brand-tag">{brand.brandTagline}</p>
            </div>
          </div>
          <SetupButton onClick={() => setSetupOpen(true)} />
        </header>

        <section className="home-portal-grid">
          {PORTALS.map((p) => (
            <Link key={p.href} href={p.href} className={`home-portal-card ${p.accent}`}>
              <span className="home-portal-card-icon">{p.icon}</span>
              <div>
                <strong>{p.title}</strong>
                <span>{p.desc}</span>
              </div>
              <em className="home-portal-arrow">→</em>
            </Link>
          ))}
        </section>

        <footer className="home-portal-foot">
          Vercel + Google Sheets · SUN Nut Milk
        </footer>
      </div>
      <SetupPanel open={setupOpen} onClose={() => setSetupOpen(false)} onBrandSaved={setBrand} />
    </main>
  );
}
