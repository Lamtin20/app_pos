'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const DEFAULT_SHEET =
  'https://docs.google.com/spreadsheets/d/1qJXloc3X3f3RB0rlc0HyoSzbtd2T3ZHURBjBRHRS8q8/edit';

function loadStored() {
  if (typeof window === 'undefined') return { sheetUrl: '', driveUrl: '' };
  return {
    sheetUrl: localStorage.getItem('sun_sheet_url') || '',
    driveUrl: localStorage.getItem('sun_drive_url') || '',
  };
}

export default function SetupPanel({ open, onClose }) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState('');
  const [testing, setTesting] = useState(false);
  const [envInfo, setEnvInfo] = useState(null);

  useEffect(() => {
    const s = loadStored();
    setSheetUrl(s.sheetUrl || DEFAULT_SHEET);
    setDriveUrl(s.driveUrl || '');
    fetch('/api/setup')
      .then((r) => r.json())
      .then(setEnvInfo)
      .catch(() => {});
  }, [open]);

  const saveLocal = useCallback((sheetId, driveFolderId) => {
    if (window.SUN_API && window.SUN_API.saveConfig) {
      window.SUN_API.saveConfig(sheetUrl, driveUrl, sheetId, driveFolderId);
    } else {
      localStorage.setItem('sun_sheet_url', sheetUrl);
      localStorage.setItem('sun_drive_url', driveUrl);
      if (sheetId) localStorage.setItem('sun_sheet_id', sheetId);
      if (driveFolderId) localStorage.setItem('sun_drive_folder_id', driveFolderId);
    }
  }, [sheetUrl, driveUrl]);

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

  function handleSave() {
    testConnection();
  }

  if (!open) return null;

  return (
    <div className="setup-overlay" onClick={onClose} role="presentation">
      <div className="setup-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="setup-close" onClick={onClose} aria-label="Đóng">
          ×
        </button>
        <h2>⚙️ Setup Google Sheet & Drive</h2>
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
            onClick={handleSave}
            disabled={testing}
          >
            {testing ? 'Đang kiểm tra…' : 'Lưu & kiểm tra kết nối'}
          </button>
        </div>

        <p className="setup-foot">
          Sau khi lưu, mở lại <Link href="/order">POS</Link> để tải menu từ Sheet.
        </p>
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
      title="Cấu hình Google Sheet & Drive"
    >
      ⚙️ {compact ? '' : 'Setup'}
    </button>
  );
}
