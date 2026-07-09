import { getMemberDeliveryZones } from '../../../../lib/backend/index.js';
import { jsonOk } from '../../../../lib/apiResponse.js';

export async function GET() {
  const zones = await getMemberDeliveryZones();
  return jsonOk(zones);
}
