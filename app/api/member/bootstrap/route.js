import { memberPortalBootstrapPayload } from '../../../../lib/backend/index.js';
import { jsonOk } from '../../../../lib/apiResponse.js';

export async function GET() {
  const data = await memberPortalBootstrapPayload();
  return jsonOk(data, 200, {
    'Cache-Control': 'public, s-maxage=90, stale-while-revalidate=180',
  });
}
