'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const DEFAULT_SHEET =
  'https://docs.google.com/spreadsheets/d/1qJXloc3X3f3RB0rlc0HyoSzbtd2T3ZHURBjBRHRS8q8/edit';

const DEFAULT_BRAND = {
  brandName: 'SUN Nut Milk',
  brandTagline: 'Tinh hoa từ hạt — hệ thống bán hàng trên Vercel + Google Sheets',
  logoUrl: 'https://i.ibb.co/8LV0snn8/logo-sun-web.png',
  faviconUrl: 'https://i.ibb.co/8LV0snn8/logo-sun-web.png',
};

function loadStored() {
  if (typeof window === 'undefined') return { sheetUrl: '', driveUrl: '' };
  return {
    sheetUrl: localStorage.getItem('sun_sheet_url') || '',
    driveUrl: localStorage.getItem('sun_drive_url') || '',
  };
}

export default function SetupPanel({ open, onClose, onBrandSaved }) {
  const [tab, setTab] = useState('sheet');
  const [sheetUrl, setSheetUrl] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [brandName, setBrandName] = useState(DEFAULT_BRAND.brandName);
  const [brandTagline, setBrandTagline] = useState(DEFAULT_BRAND.brandTagline);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_BRAND.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState(DEFAULT_BRAND.faviconUrl);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState('');
  const [testing, setTesting] = useState(false);
  const [envInfo, setEnvInfo] = useState(null);

  useEffect(() => {
    if (!open) return;
    const s = loadStored();
    setSheetUrl(s.sheetUrl || DEFAULT_SHEET);
    setDriveUrl(s.driveUrl || '');
    fetch('/api/setup')
      .then((r) => r.json())
      .then(setEnvInfo)
      .catch(() => {});
    fetch('/api/brand', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const b = data?.brand || data;
        if (b?.brandName) {
          setBrandName(b.brandName);
          setBrandTagline(b.brandTagline || '');
          setLogoUrl(b.logoUrl || '');
          setFaviconUrl(b.faviconUrl || b.logoUrl || '');
        }
      })
      .catch(() => {});
  }, [open]);

  const saveLocal = useCallback(
    (sheetId, driveFolderId) => {
      if (window.SUN_API && window.SUN_API.saveConfig) {
        window.SUN_API.saveConfig(sheetUrl, driveUrl, sheetId, driveFolderId);
      } else {
        localStorage.setItem('sun_sheet_url', sheetUrl);
        localStorage.setItem('sun_drive_url', driveUrl);
        if (sheetId) localStorage.setItem('sun_sheet_id', sheetId);
        if (driveFolderId) localStorage.setItem('sun_drive_folder_id', driveFolderId);
      }
    },
    [sheetUrl, driveUrl]
  );

  async function testConnection() {
    setTesting(true);
    setStatus('Đang kiểm tra kết nối Google Sheet…');
    setStatusKind('loading');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl, driveUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Kết nối thất bại');
      }
      saveLocal(data.sheetId, data.driveFolderId);
      setStatus(
        `✅ Kết nối OK — ${data.menuCount} món · ${data.tabCount} tab (${(data.tabs || []).slice(0, 4).join(', ')}…)`
      );
      setStatusKind('ok');
    } catch (e) {
      setStatus('❌ ' + (e.message || 'Lỗi kết nối'));
      setStatusKind('err');
    } finally {
      setTesting(false);
    }
  }

  async function saveBrand() {
    setTesting(true);
    setStatus('Đang lưu thương hiệu…');
    setStatusKind('loading');
    try {
      const res = await fetch('/api/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, brandTagline, logoUrl, faviconUrl }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Lưu thất bại');
      const saved = data.brand || { brandName, brandTagline, logoUrl, faviconUrl };
      setStatus('✅ Đã lưu thương hiệu — favicon & logo đồng bộ toàn hệ thống');
      setStatusKind('ok');
      if (onBrandSaved) onBrandSaved(saved);
      if (typeof document !== 'undefined' && saved.faviconUrl) {
        ['icon', 'apple-touch-icon'].forEach((rel) => {
          let link = document.querySelector(`link[rel="${rel}"]`);
          if (!link) {
            link = document.createElement('link');
            link.rel = rel;
            document.head.appendChild(link);
          }
          link.href = saved.faviconUrl;
        });
      }
    } catch (e) {
      setStatus('❌ ' + (e.message || 'Lỗi lưu thương hiệu'));
      setStatusKind('err');
    } finally {
      setTesting(false);
    }
  }

  function handlePrimarySave() {
    if (tab === 'brand') saveBrand();
    else testConnection();
  }

  if (!open) return null;

  return (
    <div className="setup-overlay" onClick={onClose} role="presentation">
      <div className="setup-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="setup-close" onClick={onClose} aria-label="Đóng">
          ×
        </button>
        <h2>⚙️ Setup hệ thống</h2>

        <div className="setup-tabs">
          <button
            type="button"
            className={`setup-tab ${tab === 'sheet' ? 'on' : ''}`}
            onClick={() => { setTab('sheet'); setStatus(''); }}
          >
            Google Sheet
          </button>
          <button
            type="button"
            className={`setup-tab ${tab === 'brand' ? 'on' : ''}`}
            onClick={() => { setTab('brand'); setStatus(''); }}
          >
            Thương hiệu
          </button>
        </div>

        {tab === 'sheet' ? (
          <>
            <p className="setup-lead">
              Dán link trang tính và thư mục Drive. Hệ thống lưu trên trình duyệt và gửi kèm mọi API
              (POS, Admin, Hội viên).
            </p>
            {envInfo && !envInfo.hasServiceAccount && (
              <div className="setup-warn">
                ⚠️ Vercel chưa có <strong>GOOGLE_SERVICE_ACCOUNT_EMAIL</strong> /{' '}
                <strong>GOOGLE_PRIVATE_KEY</strong> — cần cấu hình trên Vercel → Settings → Environment
                Variables.
              </div>
            )}
            <label className="setup-label">Link Google Sheet</label>
            <input
              className="setup-input"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            <label className="setup-label">Link thư mục Google Drive (ảnh sản phẩm)</label>
            <input
              className="setup-input"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
            />
            <p className="setup-hint">
              Share Sheet + folder Drive cho email Service Account (quyền <strong>Editor</strong>).
            </p>
          </>
        ) : (
          <>
            <p className="setup-lead">
              Tên, logo và favicon đồng bộ lên trang chủ, POS, Admin và Cổng hội viên.
            </p>
            <div className="setup-brand-preview">
              {logoUrl ? <img src={logoUrl} alt="" /> : <span>🌰</span>}
              <div>
                <strong>{brandName || 'SUN Nut Milk'}</strong>
                <span style={{ fontSize: 11, color: '#8b7765' }}>{brandTagline}</span>
              </div>
            </div>
            <label className="setup-label">Tên thương hiệu</label>
            <input
              className="setup-input"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="SUN Nut Milk"
            />
            <label className="setup-label">Tagline / mô tả ngắn</label>
            <input
              className="setup-input"
              value={brandTagline}
              onChange={(e) => setBrandTagline(e.target.value)}
              placeholder="Tinh hoa từ hạt…"
            />
            <label className="setup-label">URL Logo (PNG/JPG/WebP)</label>
            <input
              className="setup-input"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
            <label className="setup-label">URL Favicon (icon tab trình duyệt)</label>
            <input
              className="setup-input"
              value={faviconUrl}
              onChange={(e) => setFaviconUrl(e.target.value)}
              placeholder="https://..."
            />
            <p className="setup-hint">Dùng ảnh vuông 32×32 hoặc 64×64 px cho favicon.</p>
          </>
        )}

        {status && (
          <div className={`setup-status setup-status-${statusKind}`}>{status}</div>
        )}

        <div className="setup-actions">
          <button type="button" className="setup-btn setup-btn-sec" onClick={onClose}>
            Đóng
          </button>
          <button
            type="button"
            className="setup-btn setup-btn-primary"
            onClick={handlePrimarySave}
            disabled={testing}
          >
            {testing
              ? 'Đang xử lý…'
              : tab === 'brand'
                ? 'Lưu thương hiệu'
                : 'Lưu & kiểm tra kết nối'}
          </button>
        </div>

        {tab === 'sheet' && (
          <p className="setup-foot">
            Sau khi lưu, mở lại <Link href="/order">POS</Link> để tải menu từ Sheet.
          </p>
        )}
      </div>
    </div>
  );
}

export function SetupButton({ onClick, compact }) {
  return (
    <button
      type="button"
      className={compact ? 'setup-fab-compact' : 'setup-fab'}
      onClick={onClick}
      title="Cấu hình hệ thống"
    >
      ⚙️ {compact ? '' : 'Setup'}
    </button>
  );
}
