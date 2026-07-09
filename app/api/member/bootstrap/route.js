import { memberPortalBootstrapPayload } from '../../../../lib/backend/index.js';
import { jsonOk } from '../../../../lib/apiResponse.js';

export async function GET() {
  const data = await memberPortalBootstrapPayload();
  return jsonOk(data);
}
