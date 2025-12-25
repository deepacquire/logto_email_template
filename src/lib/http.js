export function joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

export async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    let json;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text,
      json,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestJson(
  url,
  { method = 'GET', headers = {}, json, timeoutMs = 30_000 } = {}
) {
  const finalHeaders = {
    ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  };

  const body = json === undefined ? undefined : JSON.stringify(json);
  return request(url, { method, headers: finalHeaders, body, timeoutMs });
}

export async function requestForm(
  url,
  { method = 'POST', headers = {}, form, timeoutMs = 30_000 } = {}
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(form || {})) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }

  const finalHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  };

  return request(url, { method, headers: finalHeaders, body: params.toString(), timeoutMs });
}


