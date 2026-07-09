import { getProperty } from './properties.js';

export async function verifyAdminPin(pin) {
  const expected = process.env.ADMIN_PIN || (await getProperty('ADMIN_PIN')) || '2507';
  return String(pin || '') === String(expected);
}

export function adminUnauthorized() {
  return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}
