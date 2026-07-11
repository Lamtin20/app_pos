import { getMenu, saveMenuItem, updateMenuItem, deleteMenuItem, updateMenuAvailability } from '../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export async function GET() {
  const menu = await getMenu();
  return jsonOk({ menu }, 200, {
    'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
  });
}

export async function POST(request) {
  const data = await parseJsonBody(request);
  if (!data) return jsonError('Invalid JSON');
  const id = await saveMenuItem(data);
  return jsonOk({ id });
}

export async function PATCH(request) {
  const data = await parseJsonBody(request);
  if (!data?.id) return jsonError('Missing id');
  await updateMenuItem(data.id, data);
  return jsonOk({ ok: true });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return jsonError('Missing id');
  const msg = await deleteMenuItem(id);
  return jsonOk({ message: msg });
}
