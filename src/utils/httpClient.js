/**
 * Cliente HTTP com timeout e retry exponencial.
 * Sem dependências externas — usa fetch nativo do Node 18+.
 */

const DEFAULT_TIMEOUT = parseInt(process.env.HTTP_TIMEOUT_MS || "15000", 10);

export async function httpRequest(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body = null,
    timeoutMs = DEFAULT_TIMEOUT,
    maxRetries = 3,
    retryOn = [429, 500, 502, 503, 504],
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      clearTimeout(to);

      if (retryOn.includes(res.status) && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
        continue;
      }

      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }

      return { status: res.status, ok: res.ok, text, json };
    } catch (err) {
      clearTimeout(to);
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
        continue;
      }
    }
  }

  throw lastError || new Error("httpRequest: falha desconhecida");
}
