/**
 * Controller — GET /health (e GET /)
 * Retorna status do serviço e exemplo de uso.
 */

export default function healthController(_req, res) {
  sendJson(res, 200, {
    ok: true,
    service: "verificador-juridico-ia",
    version: "0.1.0",
    endpoints: {
      "POST /verificar": "Verifica uma referência jurídica + contexto",
    },
    exemplo: {
      method: "POST",
      path: "/verificar",
      body: {
        referencia: "REsp 1.810.170/RS",
        contexto: "... (trecho da petição) ...",
      },
    },
  });
}

// Utilitário compartilhado: funciona com Vercel (res.json) e node:http puro
function sendJson(res, status, data) {
  if (typeof res.status === "function") {
    return res.status(status).json(data);
  }
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
