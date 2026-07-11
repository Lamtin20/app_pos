export function jsonOk(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers });
}

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
