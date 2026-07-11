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

function IconPos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3h2l2.4 12.2a1.5 1.5 0 0 0 1.5 1.3h8.7a1.5 1.5 0 0 0 1.5-1.2L21 8H6" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="17.5" cy="20" r="1.4" />
    </svg>
  );
}

function IconMember() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
      <path d="M17.5 3.5 18.3 5l1.6.3-1.2 1.2.3 1.6-1.5-.8-1.5.8.3-1.6L15 5.3l1.7-.3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 13.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-5.5" />
      <path d="M4 10.5 5.4 4.8A1.5 1.5 0 0 1 6.9 3.6h10.2a1.5 1.5 0 0 1 1.5 1.2L20 10.5c0 1.2-1 2.2-2.2 2.2-1.1 0-2-.8-2.2-1.9-.2 1.1-1.1 1.9-2.2 1.9h-2.8c-1.1 0-2-.8-2.2-1.9-.2 1.1-1.1 1.9-2.2 1.9C5 12.7 4 11.7 4 10.5Z" />
      <path d="M9.5 20.5v-3.4a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2v3.4" />
    </svg>
  );
}

const PORTALS = [
  {
    href: '/order',
    Icon: IconPos,
    title: 'POS — Bán hàng tại quầy',
    desc: 'Màn hình thu ngân cho nhân viên tại quầy',
    features: ['Order & in bill', 'Quản lý đơn', 'In tem ly'],
    accent: 'portal-pos',
  },
  {
    href: '/member',
    Icon: IconMember,
    title: 'Cổng hội viên',
    desc: 'Trang đặt hàng & tích điểm dành cho khách',
    features: ['Đặt sữa hạt', 'Ưu đãi & tích Sun', 'Gói giao tận nhà'],
    accent: 'portal-member',
  },
  {
    href: '/admin',
    Icon: IconAdmin,
    title: 'Quản trị (Admin)',
    desc: 'Trung tâm điều hành dành cho chủ quán',
    features: ['Doanh thu & kho', 'Menu & CMS', 'Thành viên'],
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

        <p className="home-portal-lead">Chọn khu vực làm việc của bạn</p>

        <section className="home-portal-grid">
          {PORTALS.map((p) => (
            <Link key={p.href} href={p.href} className={`home-portal-card ${p.accent}`}>
              <span className="home-portal-card-icon">
                <p.Icon />
              </span>
              <div className="home-portal-card-body">
                <strong>{p.title}</strong>
                <span className="home-portal-card-desc">{p.desc}</span>
                <span className="home-portal-card-tags">
                  {p.features.map((f) => (
                    <em key={f}>{f}</em>
                  ))}
                </span>
              </div>
              <em className="home-portal-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </em>
            </Link>
          ))}
        </section>
      </div>
      <SetupPanel open={setupOpen} onClose={() => setSetupOpen(false)} onBrandSaved={setBrand} />
    </main>
  );
}
