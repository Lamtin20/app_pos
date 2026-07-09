import { getMembershipPackages } from '../../../../lib/backend/index.js';
import { jsonOk } from '../../../../lib/apiResponse.js';

export async function GET() {
  const packages = await getMembershipPackages();
  return jsonOk({ packages });
}
