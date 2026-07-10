import { getDashboardData } from '../../../../lib/backend/index.js';
import { jsonOk } from '../../../../lib/apiResponse.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'today';
  const data = await getDashboardData(period);
  return jsonOk(data);
}
