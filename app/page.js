'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SetupPanel, { SetupButton } from '../components/SetupPanel.jsx';

export default function HomePage() {
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.search.includes('setup=1')) {
      setSetupOpen(true);
    }
  }, []);

  return (
    <main className="home-wrap">
      <div className="home-top-bar">
        <SetupButton onClick={() => setSetupOpen(true)} />
      </div>
      <h1>🌰 SUN Nut Milk</h1>
      <p>Tinh hoa từ hạt — hệ thống bán hàng trên Vercel + Google Sheets</p>
      <nav className="home-nav">
        <Link href="/order">🛒 POS — Bán hàng tại quầy</Link>
        <Link href="/member">👤 Cổng hội viên</Link>
        <Link href="/pickup">📦 Đặt hàng / Nhận hàng</Link>
        <Link href="/admin">🔐 Quản trị (Admin)</Link>
      </nav>
      <SetupPanel open={setupOpen} onClose={() => setSetupOpen(false)} />
    </main>
  );
}
