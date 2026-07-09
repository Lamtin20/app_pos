import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="home-wrap">
      <h1>🌰 SUN Nut Milk</h1>
      <p>Tinh hoa từ hạt — hệ thống bán hàng trên Vercel + Google Sheets</p>
      <nav className="home-nav">
        <Link href="/order">🛒 POS — Bán hàng tại quầy</Link>
        <Link href="/member">👤 Cổng hội viên</Link>
        <Link href="/pickup">📦 Đặt hàng / Nhận hàng</Link>
        <Link href="/admin">🔐 Quản trị (Admin)</Link>
      </nav>
    </main>
  );
}
