import { getMemberNotificationsPayload } from '../../../../lib/backend/notifications.js';
import { jsonError, jsonOk } from '../../../../lib/apiResponse.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone') || searchParams.get('p') || '';
  if (!phone) return jsonError('Missing phone');

  let accountMeta = null;
  const metaRaw = searchParams.get('accountMeta') || '';
  if (metaRaw) {
    try {
      accountMeta = JSON.parse(metaRaw);
    } catch {
      accountMeta = null;
    }
  }

  const data = await getMemberNotificationsPayload(phone, accountMeta);
  return jsonOk(data);
}
