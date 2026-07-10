import { jsonError, jsonOk } from '../../../lib/apiResponse.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = 'https://provinces.open-api.vn/api/v2';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'provinces';
  const province = searchParams.get('province');

  try {
    if (type === 'provinces') {
      const res = await fetch(`${BASE}/p/`, { next: { revalidate: 86400 } });
      if (!res.ok) throw new Error('Không tải được danh sách tỉnh/thành');
      const data = await res.json();
      return jsonOk(Array.isArray(data) ? data : []);
    }
    if (type === 'wards') {
      const code = parseInt(province, 10);
      if (!code) return jsonError('Thiếu mã tỉnh/thành', 400);
      const res = await fetch(`${BASE}/p/${code}?depth=2`, { next: { revalidate: 86400 } });
      if (!res.ok) throw new Error('Không tải được danh sách phường/xã');
      const data = await res.json();
      return jsonOk(Array.isArray(data?.wards) ? data.wards : []);
    }
    return jsonError('type không hợp lệ', 400);
  } catch (e) {
    return jsonError(e.message || String(e), 502);
  }
}
