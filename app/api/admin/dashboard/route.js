import { getDashboardData } from '../../../../lib/backend/index.js';
import { jsonOk } from '../../../../lib/apiResponse.js';

export async function GET() {
  const data = await getDashboardData();
  return jsonOk(data);
}
